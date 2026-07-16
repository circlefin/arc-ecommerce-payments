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
import { insertLifecycleEvent } from "@/lib/orders/lifecycle";
import type { SerializedPaymentInfo } from "@/lib/payments/payment-info";

/**
 * POST /api/admin/orders/[id]/void
 *
 * Cancels a Reserved authorization and returns escrowed funds to the payer.
 * Once voided, the order cannot be captured.
 */
export async function POST(
  _req: Request,
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

  const { id } = await params;
  const db = createServiceClient();
  const { data: order, error: fetchError } = await db
    .from("orders")
    .select("id, status, payment_info")
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

  let txHash: string;
  try {
    ({ txHash } = await voidAuthorization(paymentInfo));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Void failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Insert before the order update commits so the realtime UPDATE
  // notification never races ahead of the lifecycle row it should surface.
  await insertLifecycleEvent({ orderId: order.id, operation: "Voided", txHash });

  await db
    .from("orders")
    .update({ status: "Canceled", captured_amount: 0 })
    .eq("id", order.id);

  return NextResponse.json({ txHash, status: "Canceled" });
}
