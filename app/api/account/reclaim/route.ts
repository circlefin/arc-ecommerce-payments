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
import { insertLifecycleEvent } from "@/lib/orders/lifecycle";

/**
 * POST /api/account/reclaim
 * Body: { orderId: string; txHash: string }
 *
 * Shopper self-service reclaim DB update.
 *
 * The escrow's `reclaim()` requires `msg.sender == paymentInfo.payer`, so the
 * shopper's wallet submits the transaction client-side (see ReclaimButton).
 * This endpoint receives the confirmed txHash and updates the order status
 * to Expired. The SCP webhook also handles this event; this call is a fast
 * fallback so the UI reflects the change immediately.
 */
export async function POST(req: Request) {
  const supabase = await createClient();

  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { orderId?: unknown; txHash?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.orderId !== "string" || !body.orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }
  if (typeof body.txHash !== "string" || !body.txHash) {
    return NextResponse.json({ error: "txHash is required" }, { status: 400 });
  }

  // RLS already scopes this to the signed-in user's own orders; the user_id
  // filter is belt-and-suspenders in case RLS policy is misconfigured.
  const db = createServiceClient();
  const { data: order, error: fetchError } = await db
    .from("orders")
    .select("id, status, user_id")
    .eq("id", body.orderId)
    .eq("user_id", userId)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.status !== "Reserved") {
    return NextResponse.json(
      { error: "Only Reserved orders can be reclaimed" },
      { status: 409 },
    );
  }

  // Insert before the order update commits so the realtime UPDATE
  // notification never races ahead of the lifecycle row it should surface.
  await insertLifecycleEvent({
    orderId: order.id,
    operation: "Reclaimed",
    txHash: body.txHash,
  });

  await db
    .from("orders")
    .update({ status: "Expired" })
    .eq("id", order.id);

  return NextResponse.json({ txHash: body.txHash, status: "Expired" });
}
