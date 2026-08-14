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

  const txHash = data?.transactionHash;

  const amount = toTokenUnits(data?.amount);

  if (!txHash) {
    return NextResponse.json(
      { error: "missing transaction hash" },
      { status: 400 },
    );
  }

  let note: string | null = null;

  if (eventName === "Captured" || eventName === "Refunded") {
    const currentAmount = amount ?? 0;

    if (eventName === "Captured") {
      const newCaptured = (order.captured_amount ?? 0) + currentAmount;
      note = newCaptured >= order.total - 0.0001 ? null : "partial";
    } else {
      const newRefunded = (order.refunded_amount ?? 0) + currentAmount;
      note =
        newRefunded >=
        (order.captured_amount ?? order.total) - 0.0001
          ? null
          : "partial";
    }
  }

  const { data: processed, error: processError } = await supabase.rpc(
    "process_webhook_event",
    {
      p_order_id: order.id,
      p_operation: eventName,
      p_tx_hash: txHash,
      p_amount: amount ?? null,
      p_note: note,
      p_block_number: data.blockNumber ?? null,
    },
  );

  if (processError) {
    console.error(
      "[webhook] atomic event processing failed",
      order.id,
      processError.message,
    );

    return NextResponse.json(
      { error: "db update failed" },
      { status: 500 },
    );
  }

  if (!processed) {
    console.log(
      `[webhook] duplicate delivery ignored for tx ${txHash} (${eventName})`,
    );

    return NextResponse.json({ ok: true, duplicate: true });
  }
  console.log(
    `[webhook] ${eventName} -> order ${order.id} processed`,
    { txHash, amount, note },
  );

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest): Promise<Response> {
  const { createServiceClient } = await import("@/lib/supabase/service");
  return handleWebhook(req, createServiceClient());
}
