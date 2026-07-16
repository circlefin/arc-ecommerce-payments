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

  let txHash: string;
  try {
    ({ txHash } = await capture(paymentInfo, amountUnits));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Capture failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const newCaptured = Number(order.captured_amount) + body.amount;
  const newStatus =
    newCaptured >= Number(order.total) - 0.0001 ? "Paid" : "Reserved";

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

  await db
    .from("orders")
    .update({ captured_amount: newCaptured, status: newStatus })
    .eq("id", order.id);

  return NextResponse.json({ txHash, status: newStatus, capturedAmount: newCaptured });
}
