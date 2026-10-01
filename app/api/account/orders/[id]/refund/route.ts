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
 * POST /api/account/orders/[id]/refund
 *
 * Shopper-initiated refund request. Refunds the full remaining captured
 * amount back to the shopper's wallet. Only valid while the order is Paid and
 * within the `refundExpiry` window. The merchant DCW signs the ERC-3009
 * authorization server-side (handled in `operator.refund`), so no merchant
 * interaction or browser wallet is required from the shopper.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();

  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = createServiceClient();
  const { data: order, error: fetchError } = await db
    .from("orders")
    .select(
      "id, status, captured_amount, refunded_amount, payment_info, user_id",
    )
    .eq("id", id)
    .eq("user_id", userId)
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

  const paymentInfo = deserializePaymentInfo(
    order.payment_info as SerializedPaymentInfo,
  );

  const now = Math.floor(Date.now() / 1000);
  if (now > paymentInfo.refundExpiry) {
    return NextResponse.json(
      { error: "Refund window has closed for this order" },
      { status: 409 },
    );
  }

  const refundable =
    Number(order.captured_amount ?? 0) - Number(order.refunded_amount ?? 0);
  if (refundable <= 0) {
    return NextResponse.json(
      { error: "No refundable amount remaining" },
      { status: 409 },
    );
  }

  const amountUnits = BigInt(Math.round(refundable * 1_000_000));

  const previouslyRefunded = Number(order.refunded_amount ?? 0);
  const newRefunded = previouslyRefunded + refundable;

  // Claim the refund before signing.
  //
  // Security fix: the status/amount checks above ran in application code only, and the write
  // at the end matched on `id` alone. Two concurrent POSTs both read `refunded_amount = 0`,
  // both passed `refundable > 0`, and both called `refund()` — so the merchant DCW signed two
  // real ERC-3009 refunds while the second write left `refunded_amount` unchanged, making the
  // double spend invisible in the database. The compare-and-swap below (filtering on the exact
  // `refunded_amount` and status we just read) guarantees only one request can win; the loser
  // gets zero rows back and is rejected before any signature is produced.
  const { data: claimed, error: claimError } = await db
    .from("orders")
    .update({ refunded_amount: newRefunded, status: "Refunded" })
    .eq("id", order.id)
    .eq("refunded_amount", previouslyRefunded)
    .in("status", ["Paid", "Shipped"])
    .select("id");

  if (claimError) {
    console.error("[refund] failed to claim refund for order", order.id, claimError);
    return NextResponse.json({ error: "Unable to reserve refund" }, { status: 500 });
  }

  if (!claimed || claimed.length === 0) {
    console.warn(
      "[refund] concurrent refund rejected for order",
      order.id,
      "— another request already claimed it",
    );
    return NextResponse.json(
      { error: "A refund for this order is already in progress" },
      { status: 409 },
    );
  }

  let txHash: string;
  try {
    ({ txHash } = await refund(paymentInfo, amountUnits));
  } catch (err) {
    // The claim was already written, so release it to keep the order refundable on retry.
    await db
      .from("orders")
      .update({ refunded_amount: previouslyRefunded, status: order.status })
      .eq("id", order.id)
      .eq("refunded_amount", newRefunded);

    const message = err instanceof Error ? err.message : "Refund failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Insert before the order update commits so the realtime UPDATE
  // notification never races ahead of the lifecycle row it should surface.
  await insertLifecycleEvent({
    orderId: order.id,
    operation: "Refunded",
    txHash,
    amount: refundable,
  });

  return NextResponse.json({ txHash, status: "Refunded", refundedAmount: newRefunded });
}
