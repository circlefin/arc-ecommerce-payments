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

/**
 * POST /api/webhooks/payments
 *
 * Receives Smart Contract Platform (SCP) event-monitoring push notifications
 * for the escrow contract and updates the corresponding order status in the DB.
 * When the contracts are deployed on Arc and the SCP webhook is registered,
 * this is the only code path that drives order state -
 * the UI never polls; it reacts to DB changes via Supabase Realtime.
 *
 * Event -> order status mapping:
 *   Authorized   -> Reserved
 *   Captured     -> Paid   (full) or stays Reserved (partial, captured_amount updated)
 *   Charged      -> Paid   (authorize + capture in one tx)
 *   Voided       -> Canceled
 *   Reclaimed    -> Expired
 *   Refunded     -> Refunded (full) or stays Paid with refunded_amount updated (partial)
 *
 * Each event also inserts a row into `lifecycle_events` which the
 * "Under the hood" panel reads to animate the order timeline.
 *
 * Uses the service-role Supabase client so RLS does not block webhook reads
 * or writes (the webhook has no user session / JWT).
 *
 * Setup:
 *   1. Deploy escrow + token collector via SCP and note the contract address.
 *   2. Register this URL in SCP event monitoring for that contract.
 *   3. Set WEBHOOK_SECRET in env; SCP will sign each request with HMAC-SHA256.
 *
 * Order lookup key: the SCP event payload carries the payment salt (a unique
 * uint256 per PaymentInfo). This is stored in the orders table under
 * payment_info->>'salt'. The salt is set at checkout and never changes, making
 * it the stable cross-operation identifier.
 *
 * NOTE: Circle's Notifications API (wallet-level `transactions.inbound`/
 * `transactions.outbound` events, subscribed per-wallet) is a different
 * product from SCP contract event monitoring and uses a different payload
 * shape entirely - it has no `eventName`/`data.salt`, so it falls through the
 * `if (!salt)` guard below and is a silent no-op here. Order status and
 * `lifecycle_events` rows are written directly from each operator route
 * (`lib/orders/record.ts`, the capture/void/refund/reclaim routes) so the UI
 * works without SCP event monitoring configured. This handler stays in place
 * for when the escrow contract is registered with SCP event monitoring.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// --- Event types emitted by the escrow contract ---

type ScpEventName =
  | "Authorized"
  | "Captured"
  | "Charged"
  | "Voided"
  | "Reclaimed"
  | "Refunded";

interface ScpWebhookPayload {
  /** SCP contract address that emitted the event. */
  contractAddress: string;
  /** Emitted event name. */
  eventName: ScpEventName;
  /** Decoded event parameters. */
  data: {
    /**
     * PaymentInfo salt - the stable per-order identifier, stored as a decimal
     * string matching payment_info->>'salt' in the orders table.
     */
    salt?: string;
    /**
     * Amount involved (captured / refunded) in token base units (6 decimals).
     * e.g. "2800000" = 2.80 USDC.
     */
    amount?: string;
    /** Arc transaction hash for the lifecycle event log. */
    transactionHash?: string;
    blockNumber?: number;
  };
}

// --- Updatable order columns ---

type OrderPatch = {
  status?: string;
  captured_amount?: number;
  refunded_amount?: number;
};

// --- Helpers ---

function toTokenUnits(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  return Number(raw) / 1_000_000;
}

// --- Webhook handler ---

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Signature verification (uncomment once WEBHOOK_SECRET is set in env).
  // const secret = process.env.WEBHOOK_SECRET;
  // if (secret) {
  //   const sig = req.headers.get("x-scp-signature") ?? "";
  //   const body = await req.text();
  //   const expected = createHmac("sha256", secret).update(body).digest("hex");
  //   if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
  //     return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  //   }
  // }

  let payload: ScpWebhookPayload;
  try {
    payload = (await req.json()) as ScpWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { eventName, data } = payload;
  const salt = data?.salt;

  if (!salt) {
    // Not every event carries a salt we can route to an order; skip silently.
    return NextResponse.json({ ok: true });
  }

  // Service-role client bypasses RLS - the webhook has no user session.
  const supabase = createServiceClient();

  // Look up the order by the PaymentInfo salt stored in the payment_info JSONB.
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, status, total, currency, captured_amount, refunded_amount")
    .filter("payment_info->>salt", "eq", salt)
    .single();

  if (fetchError || !order) {
    console.error("[webhook] order not found for salt", salt, fetchError?.message);
    return NextResponse.json({ error: "order not found" }, { status: 404 });
  }

  const amount = toTokenUnits(data?.amount);
  const patch: OrderPatch = {};
  let note: string | null = null;

  switch (eventName) {
    case "Authorized":
      patch.status = "Reserved";
      break;

    case "Charged":
      patch.status = "Paid";
      if (amount !== undefined) patch.captured_amount = amount;
      break;

    case "Captured": {
      const newCaptured = (order.captured_amount ?? 0) + (amount ?? 0);
      patch.captured_amount = newCaptured;
      if (newCaptured >= order.total - 0.0001) {
        patch.status = "Paid";
      } else {
        note = "partial";
      }
      break;
    }

    case "Voided":
      patch.status = "Canceled";
      break;

    case "Reclaimed":
      patch.status = "Expired";
      break;

    case "Refunded": {
      const newRefunded = (order.refunded_amount ?? 0) + (amount ?? 0);
      patch.refunded_amount = newRefunded;
      if (newRefunded >= (order.captured_amount ?? order.total) - 0.0001) {
        patch.status = "Refunded";
      } else {
        note = "partial";
      }
      break;
    }

    default:
      return NextResponse.json({ ok: true });
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", order.id);

  if (updateError) {
    console.error("[webhook] update failed", order.id, updateError.message);
    return NextResponse.json({ error: "db update failed" }, { status: 500 });
  }

  // Insert a lifecycle_events row for the "Under the hood" visualizer.
  if (data?.transactionHash) {
    const { error: eventError } = await supabase.from("lifecycle_events").insert({
      order_id: order.id,
      operation: eventName,
      tx_hash: data.transactionHash,
      amount: amount ?? null,
      note,
      block_number: data.blockNumber ?? null,
    });
    if (eventError) {
      // Log but don't fail the webhook - the order status update already succeeded.
      console.error("[webhook] lifecycle_events insert failed", eventError.message);
    }
  }

  console.log(
    `[webhook] ${eventName} -> order ${order.id} patched`,
    patch,
    "tx:", data?.transactionHash,
  );

  return NextResponse.json({ ok: true });
}
