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
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { serializePaymentInfo } from "@/lib/payments/payment-info";
import { insertLifecycleEvent } from "@/lib/orders/lifecycle";
import type { Intent } from "@/lib/payments/intent-store";


/**
 * Persist a completed checkout to the `orders` table.
 *
 * Called only after the Authorize transaction is confirmed on-chain, so
 * the funds have already moved. Persistence is therefore best-effort: it must
 * never turn a settled payment into a user-facing failure. On any problem it
 * logs and returns null, and the caller falls back to a placeholder reference.
 *
 * Returns the database-assigned order id (uuid) on success.
 */
export async function recordOrder(params: {
  intent: Intent;
  status: "Reserved";
  txHash: string;
}): Promise<string | null> {
  const { intent, status, txHash } = params;
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getClaims();
    const userId = authData?.claims?.sub;
    if (!userId) {
      console.warn("[checkout] no authenticated user; order not persisted");
      return null;
    }

    // Use service client so the insert isn't blocked by RLS - the user
    // identity has already been verified above via the signed JWT.
    const db = createServiceClient();
    const { data, error } = await db
      .from("orders")
      .insert({
        user_id: userId,
        payer: intent.paymentInfo.payer,
        currency: intent.currency,
        total: intent.total,
        status,
        // Authorize reserves the funds in escrow; capture happens on fulfillment.
        captured_amount: 0,
        payment_info: serializePaymentInfo(intent.paymentInfo),
        items: intent.items,
        tx_hash: txHash,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[checkout] order DB write failed:", error.message);
      return null;
    }

    await insertLifecycleEvent({
      orderId: data.id,
      operation: "Authorized",
      txHash,
    });

    return data.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[checkout] order persistence threw:", message);
    return null;
  }
}
