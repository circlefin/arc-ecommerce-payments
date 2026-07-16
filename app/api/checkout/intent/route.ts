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
import { isAddress, parseUnits, type Address } from "viem";
import { tokenFor } from "@/lib/arc/tokens";
import { escrowAddress, tokenCollectorAddress } from "@/lib/contracts";
import { buildPaymentInfo } from "@/lib/payments/payment-info";
import { payerAgnosticNonce } from "@/lib/payments/authorization";
import { putIntent, type OrderLineItem } from "@/lib/payments/intent-store";
import { operatorAddress, merchantReceiver } from "@/lib/operator/config";
import type { Currency } from "@/lib/products";

/**
 * Build the payment intent for an order. The operator assembles + holds the
 * PaymentInfo server-side and returns only what the shopper needs to sign the
 * ERC-3009 authorization (nonce, value, expiry, collector). The signature comes
 * back to /api/checkout/authorize, which relays the held intent.
 */
const CURRENCIES: Currency[] = ["USDC", "EURC"];

/** Validate the client cart lines into clean order display items. */
function parseItems(raw: unknown): OrderLineItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const items: OrderLineItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const { name, qty, price } = entry as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) return null;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0) return null;
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) return null;
    items.push({ name, qty, price });
  }
  return items;
}

export async function POST(req: Request) {
  let body: {
    currency?: string;
    amount?: string;
    payer?: string;
    items?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { currency, amount, payer } = body;
  if (!currency || !CURRENCIES.includes(currency as Currency)) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }
  if (!payer || !isAddress(payer)) {
    return NextResponse.json({ error: "Invalid payer address" }, { status: 400 });
  }
  const total = Number(amount);
  if (!amount || !Number.isFinite(total) || total <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  const items = parseItems(body.items);
  if (!items) {
    return NextResponse.json({ error: "Invalid cart items" }, { status: 400 });
  }

  const token = tokenFor(currency as Currency);
  const maxAmount = parseUnits(amount, token.decimals);

  const paymentInfo = buildPaymentInfo({
    operator: operatorAddress(),
    payer: payer as Address,
    receiver: merchantReceiver(),
    token: token.address,
    maxAmount,
  });

  const nonce = await payerAgnosticNonce(escrowAddress(), paymentInfo);
  putIntent(nonce, {
    paymentInfo,
    currency: currency as Currency,
    total,
    items,
  });

  return NextResponse.json({
    nonce,
    value: maxAmount.toString(),
    preApprovalExpiry: paymentInfo.preApprovalExpiry,
    collector: tokenCollectorAddress(),
    currency,
  });
}
