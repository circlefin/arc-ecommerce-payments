/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type ScpEventName =
  | "Authorized"
  | "Captured"
  | "Charged"
  | "Voided"
  | "Reclaimed"
  | "Refunded";

interface ScpWebhookPayload {
  contractAddress: string;
  eventName: ScpEventName;
  data: {
    salt?: string;
    amount?: string;
    transactionHash?: string;
    blockNumber?: number;
  };
}

type OrderPatch = {
  status?: string;
  captured_amount?: number;
  refunded_amount?: number;
};

function toTokenUnits(raw: string | undefined): number | undefined {
  if (!raw) return undefined;

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    return undefined;
  }

  return value / 1_000_000;
}

function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function handleWebhook(
  req: NextRequest,
  supabase: SupabaseClient,
): Promise<Response> {
  const secret = process.env.WEBHOOK_SECRET;

  if (!secret) {
    console.error("[webhook] WEBHOOK_SECRET is not configured");

    return NextResponse.json(
      { error: "webhook not configured" },
      { status: 500 },
    );
  }

  const signature = req.headers.get("x-scp-signature") ?? "";

  if (!signature) {
    console.warn("[webhook] missing signature");

    return NextResponse.json(
      { error: "missing signature" },
      { status: 401 },
    );
  }

  const body = await req.text();

  if (!verifyWebhookSignature(body, signature, secret)) {
    console.warn("[webhook] invalid signature");

    return NextResponse.json(
      { error: "invalid signature" },
      { status: 401 },
    );
  }

  let payload: ScpWebhookPayload;

  try {
    payload = JSON.parse(body) as ScpWebhookPayload;
  } catch {
    return NextResponse.json(
      { error: "invalid JSON" },
      { status: 400 },
    );
  }

  const { eventName, data } = payload;
  const salt = data?.salt;

  if (!salt) {
    return NextResponse.json({ ok: true });
  }


  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select(
      "id, status, total, currency, captured_amount, refunded_amount",
    )
    .filter("payment_info->>salt", "eq", salt)
    .single();

  if (fetchError || !order) {
    console.error(
      "[webhook] order not found for salt",
      salt,
      fetchError?.message,
    );

    return NextResponse.json(
      { error: "order not found" },
      { status: 404 },
    );
  }

  // --- Idempotency guard ---
  // SCP (or any at-least-once delivery system) may redeliver the same event.
  // Each on-chain event carries a unique transactionHash; if we've already
  // recorded a lifecycle_events row for this tx + operation, the event was
  // already applied, so we skip re-patching the order to avoid double-
  // counting captured_amount / refunded_amount.
  //
  // NOTE: this is a best-effort, request-time check. For a hard guarantee
  // against race conditions from near-simultaneous duplicate deliveries,
  // pair this with a UNIQUE constraint on lifecycle_events(tx_hash, operation)
  // at the DB level (tracked as a follow-up migration).
  const txHash = data?.transactionHash;

  if (txHash) {
    const { data: existingEvent, error: dupCheckError } = await supabase
      .from("lifecycle_events")
      .select("id")
      .eq("tx_hash", txHash)
      .eq("operation", eventName)
      .maybeSingle();

    if (dupCheckError) {
      console.error(
        "[webhook] idempotency check failed",
        dupCheckError.message,
      );
    } else if (existingEvent) {
      console.log(
        `[webhook] duplicate delivery ignored for tx ${txHash} (${eventName})`,
      );

      return NextResponse.json({ ok: true, duplicate: true });
    }
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

      if (amount !== undefined) {
        patch.captured_amount = amount;
      }

      break;

    case "Captured": {
      const newCaptured =
        (order.captured_amount ?? 0) + (amount ?? 0);

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
      const newRefunded =
        (order.refunded_amount ?? 0) + (amount ?? 0);

      patch.refunded_amount = newRefunded;

      if (
        newRefunded >=
        (order.captured_amount ?? order.total) - 0.0001
      ) {
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
    console.error(
      "[webhook] update failed",
      order.id,
      updateError.message,
    );

    return NextResponse.json(
      { error: "db update failed" },
      { status: 500 },
    );
  }

  if (data?.transactionHash) {
    const { error: eventError } = await supabase
      .from("lifecycle_events")
      .insert({
        order_id: order.id,
        operation: eventName,
        tx_hash: data.transactionHash,
        amount: amount ?? null,
        note,
        block_number: data.blockNumber ?? null,
      });

    if (eventError) {
      console.error(
        "[webhook] lifecycle_events insert failed",
        eventError.message,
      );
    }
  }

  console.log(
    `[webhook] ${eventName} -> order ${order.id} patched`,
    patch,
    "tx:",
    data?.transactionHash,
  );

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest): Promise<Response> {
  const { createServiceClient } = await import("@/lib/supabase/service");
  return handleWebhook(req, createServiceClient());
}
