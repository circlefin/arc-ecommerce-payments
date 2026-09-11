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

import { NextResponse } from "next/server";
import { isHex, type Hex } from "viem";
import { authorize } from "@/lib/operator/operations";
import { takeIntent } from "@/lib/payments/intent-store";
import { recordOrder } from "@/lib/orders/record";

/**
 * Relay the shopper's ERC-3009 signature. Looks up the PaymentInfo held under
 * the nonce, then submits Authorize from the operator wallet - sponsoring Arc
 * gas. On a confirmed transaction it persists the order and returns its id, the
 * on-chain tx hash, and the resulting order state.
 */

export async function POST(req: Request) {
  let body: { nonce?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { nonce, signature } = body;
  if (!nonce || !isHex(nonce)) {
    return NextResponse.json({ error: "Invalid nonce" }, { status: 400 });
  }
  if (!signature || !isHex(signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const intent = takeIntent(nonce as Hex);
  if (!intent) {
    return NextResponse.json(
      { error: "Intent not found or expired. Restart checkout." },
      { status: 410 },
    );
  }

  let txHash: string;
  try {
    ({ txHash } = await authorize(intent.paymentInfo, signature as Hex));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Relay failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Payment is settled on-chain past this point. A database failure must be
  // reported explicitly: a generated UUID would not exist in Supabase and
  // would make the receipt/history misleading. Return the transaction hash so
  // support can reconcile the settled payment.
  const status = "Reserved";
  const orderId = await recordOrder({ intent, status, txHash });

  if (!orderId) {
    return NextResponse.json(
      {
        error:
          "Payment confirmed on-chain, but the order could not be recorded. Save the transaction hash and contact support.",
        txHash,
        orderPersisted: false,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ txHash, orderId, status });
}
