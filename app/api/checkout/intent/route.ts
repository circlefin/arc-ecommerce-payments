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
import { PRODUCT_BY_ID, PRODUCT_BY_NAME, type Currency } from "@/lib/products";

/**
 * Build the payment intent for an order. The operator assembles + holds the
 * PaymentInfo server-side and returns only what the shopper needs to sign the
 * ERC-3009 authorization (nonce, value, expiry, collector). The signature comes
 * back to /api/checkout/authorize, which relays the held intent.
 */
const CURRENCIES: Currency[] = ["USDC", "EURC"];

/** Upper bound on a single line's quantity, to bound one authorization request. */
const MAX_QTY_PER_LINE = 100;

/**
 * Validate the client cart against the server-side product catalog and rebuild it from
 * catalog prices.
 *
 * Security fix: this previously accepted the client's `price` and `amount` verbatim. The
 * operator then relayed a real ERC-3009 authorization for whatever amount was posted and
 * `recordOrder` persisted the shopper's own total and unit prices as the order of record, so a
 * client could buy a 0.85 USDC polo for one micro-unit. Prices are now always read from
 * `lib/products.ts` on the server, and the request `amount` is ignored and recomputed.
 */
function priceCart(raw: unknown): { items: OrderLineItem[]; total: number } | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const items: OrderLineItem[] = [];
  let total = 0;

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;

    const { name, qty } = entry as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) return null;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0) return null;

    const product = PRODUCT_BY_NAME[name.trim()] ?? PRODUCT_BY_ID[name.trim()];
    // An unknown line item means the client is not transacting against this catalog.
    if (!product) return null;

    // Cap a single line to a sane quantity so the cart cannot be used to force an
    // unreasonable authorization in one request.
    if (qty > MAX_QTY_PER_LINE) return null;

    const line = { name: product.name, qty, price: product.price };
    items.push(line);
    total += line.qty * line.price;
  }

  if (!Number.isFinite(total) || total <= 0) return null;

  return { items, total };
}

export async function POST(req: Request) {
  let body: {
    currency?: string;
    payer?: string;
    items?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { currency, payer } = body;
  if (!currency || !CURRENCIES.includes(currency as Currency)) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }
  if (!payer || !isAddress(payer)) {
    return NextResponse.json({ error: "Invalid payer address" }, { status: 400 });
  }

  // Price the cart server-side; any client-supplied `amount` is deliberately ignored.
  const priced = priceCart(body.items);
  if (!priced) {
    return NextResponse.json({ error: "Invalid cart items" }, { status: 400 });
  }

  const { items, total } = priced;

  const token = tokenFor(currency as Currency);
  const maxAmount = parseUnits(total.toFixed(token.decimals), token.decimals);

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
