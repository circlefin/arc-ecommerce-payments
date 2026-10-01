/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { deserializePaymentInfo } from "@/lib/payments/payment-info";
import { capture } from "@/lib/operator/operations";
import { insertLifecycleEvent } from "@/lib/orders/lifecycle";
import type { SerializedPaymentInfo } from "@/lib/payments/payment-info";

/**
 * POST /api/admin/orders/[id]/capture
 * Body: { amount: number }   - human-readable token units (e.g. 2.80 for 2.80 USDC)
 *
 * Submits escrow.capture from the operator DCW, updating `captured_amount` and
 * promoting to Paid when fully captured. The webhook may also fire for
 * the same event - both converge to the same state; the DB write here is the
 * optimistic update that keeps the admin UI responsive.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();

  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((claims.app_metadata as { role?: string } | undefined)?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { amount?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.amount !== "number" || body.amount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive number" },
      { status: 400 },
    );
  }

  const { id } = await params;
  const db = createServiceClient();
  const { data: order, error: fetchError } = await db
    .from("orders")
    .select("id, status, total, captured_amount, payment_info")
    .eq("id", id)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.status !== "Reserved") {
    return NextResponse.json(
      { error: `Order is ${order.status}, not Reserved` },
      { status: 409 },
    );
  }

  const paymentInfo = deserializePaymentInfo(
    order.payment_info as SerializedPaymentInfo,
  );
  const amountUnits = BigInt(Math.round(body.amount * 1_000_000));

  const previouslyCaptured = Number(order.captured_amount);
  const newCaptured = previouslyCaptured + body.amount;
  const newStatus =
    newCaptured >= Number(order.total) - 0.0001 ? "Paid" : "Reserved";

  // Claim the capture before signing.
  //
  // Security fix: the `Reserved` precondition lived in application code and the write matched
  // on `id` alone. Two simultaneous captures both read `captured_amount = 0` and both executed
  // `escrow.capture` on-chain, but the row ended at `1.0` instead of `2.0` — permanently
  // under-reporting captured funds and leaving the order re-capturable. The compare-and-swap
  // below (filtering on the exact `captured_amount` and status just read) lets exactly one
  // request proceed to a signature.
  const { data: claimed, error: claimError } = await db
    .from("orders")
    .update({ captured_amount: newCaptured, status: newStatus })
    .eq("id", order.id)
    .eq("captured_amount", previouslyCaptured)
    .eq("status", "Reserved")
    .select("id");

  if (claimError) {
    console.error("[capture] failed to claim capture for order", order.id, claimError);
    return NextResponse.json({ error: "Unable to reserve capture" }, { status: 500 });
  }

  if (!claimed || claimed.length === 0) {
    console.warn(
      "[capture] concurrent capture rejected for order",
      order.id,
      "— another request already claimed it",
    );
    return NextResponse.json(
      { error: "Order changed while capturing; retry" },
      { status: 409 },
    );
  }

  let txHash: string;
  try {
    ({ txHash } = await capture(paymentInfo, amountUnits));
  } catch (err) {
    // Roll the claim back so the operator can retry without leaving a phantom capture.
    await db
      .from("orders")
      .update({ captured_amount: previouslyCaptured, status: "Reserved" })
      .eq("id", order.id)
      .eq("captured_amount", newCaptured);

    const message = err instanceof Error ? err.message : "Capture failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Insert the lifecycle event before the order update commits, so the
  // realtime UPDATE notification (which triggers the client's refetch) never
  // races ahead of the row it's meant to surface.
  await insertLifecycleEvent({
    orderId: order.id,
    operation: "Captured",
    txHash,
    amount: body.amount,
    note: newStatus === "Reserved" ? "partial" : undefined,
  });

  return NextResponse.json({ txHash, status: newStatus, capturedAmount: newCaptured });
}
