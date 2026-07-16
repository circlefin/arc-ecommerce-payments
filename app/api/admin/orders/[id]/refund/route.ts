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
import { refund } from "@/lib/operator/operations";
import { insertLifecycleEvent } from "@/lib/orders/lifecycle";
import type { SerializedPaymentInfo } from "@/lib/payments/payment-info";

/**
 * POST /api/admin/orders/[id]/refund
 * Body: { amount: number }   - human-readable token units
 *
 * The merchant DCW signs an ERC-3009 authorization (handled inside
 * `operator.refund`) that lets the collector pull funds back from the receiver
 * into escrow, then releases them to the original payer. Supports partials.
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
    .select("id, status, total, captured_amount, refunded_amount, payment_info")
    .eq("id", id)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.status !== "Paid" && order.status !== "Shipped") {
    return NextResponse.json(
      { error: `Order is ${order.status}; refund requires Paid or Shipped` },
      { status: 409 },
    );
  }

  const maxRefund =
    Number(order.captured_amount ?? order.total) -
    Number(order.refunded_amount ?? 0);
  if (body.amount > maxRefund + 0.0001) {
    return NextResponse.json(
      { error: `Amount exceeds refundable balance of ${maxRefund.toFixed(6)}` },
      { status: 422 },
    );
  }

  const paymentInfo = deserializePaymentInfo(
    order.payment_info as SerializedPaymentInfo,
  );
  const amountUnits = BigInt(Math.round(body.amount * 1_000_000));

  let txHash: string;
  try {
    ({ txHash } = await refund(paymentInfo, amountUnits));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refund failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const newRefunded = Number(order.refunded_amount ?? 0) + body.amount;
  const fullyRefunded =
    newRefunded >= Number(order.captured_amount ?? order.total) - 0.0001;
  const newStatus = fullyRefunded ? "Refunded" : order.status;

  // Insert before the order update commits so the realtime UPDATE
  // notification never races ahead of the lifecycle row it should surface.
  await insertLifecycleEvent({
    orderId: order.id,
    operation: "Refunded",
    txHash,
    amount: body.amount,
    note: fullyRefunded ? undefined : "partial",
  });

  await db
    .from("orders")
    .update({ refunded_amount: newRefunded, status: newStatus })
    .eq("id", order.id);

  return NextResponse.json({
    txHash,
    status: newStatus,
    refundedAmount: newRefunded,
  });
}
