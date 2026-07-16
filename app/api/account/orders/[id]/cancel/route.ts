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
import { voidAuthorization } from "@/lib/operator/operations";
import type { SerializedPaymentInfo } from "@/lib/payments/payment-info";

/**
 * POST /api/account/orders/[id]/cancel
 *
 * Shopper-initiated cancel (Void) before fulfillment. Only valid while
 * the order is Reserved and the authorizationExpiry has not yet passed (after
 * expiry the shopper should use Reclaim instead). The operator submits the
 * void transaction, sponsoring gas, so the shopper never pays it.
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
    .select("id, status, payment_info, user_id")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.status !== "Reserved") {
    return NextResponse.json(
      { error: `Order is ${order.status}; only Reserved orders can be canceled` },
      { status: 409 },
    );
  }

  const paymentInfo = deserializePaymentInfo(
    order.payment_info as SerializedPaymentInfo,
  );

  const now = Math.floor(Date.now() / 1000);
  if (now > paymentInfo.authorizationExpiry) {
    return NextResponse.json(
      { error: "Authorization has expired - use Reclaim to recover your funds instead" },
      { status: 409 },
    );
  }

  let txHash: string;
  try {
    ({ txHash } = await voidAuthorization(paymentInfo));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cancel failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await db
    .from("orders")
    .update({ status: "Canceled", captured_amount: 0 })
    .eq("id", order.id);

  return NextResponse.json({ txHash, status: "Canceled" });
}
