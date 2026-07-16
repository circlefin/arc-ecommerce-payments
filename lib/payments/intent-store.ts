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
import type { Hex } from "viem";
import type { PaymentInfo } from "@/lib/payments/types";
import type { Currency } from "@/lib/products";

/**
 * Short-lived server-side hold of the PaymentInfo built at checkout, keyed by
 * its payer-agnostic nonce. The storefront receives only the nonce + the few
 * fields it needs to sign; it never echoes the full intent back. So when it
 * posts the signature, the operator relays the server's own PaymentInfo - the
 * shopper can't redirect the receiver or change the amount they didn't sign.
 *
 * The order's display details (currency, total, line items) ride along too, so
 * the order row is assembled from the server's held intent at relay time rather
 * than trusting a second client payload.
 *
 * In-memory and single-process: fine for this demo's local operator service.
 * A multi-instance deployment would back this with a shared store.
 */
export type OrderLineItem = { name: string; qty: number; price: number };

export type Intent = {
  paymentInfo: PaymentInfo;
  /** Settlement currency, mirrored onto the order row. */
  currency: Currency;
  /** Order total in token display units. */
  total: number;
  /** Cart line items captured for the order's display. */
  items: OrderLineItem[];
  createdAt: number;
};

const TTL_MS = 10 * 60 * 1000;
const intents = new Map<Hex, Intent>();

function sweep(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [nonce, intent] of intents) {
    if (intent.createdAt < cutoff) intents.delete(nonce);
  }
}

export function putIntent(nonce: Hex, intent: Omit<Intent, "createdAt">): void {
  sweep();
  intents.set(nonce, { ...intent, createdAt: Date.now() });
}

export function takeIntent(nonce: Hex): Intent | undefined {
  sweep();
  const intent = intents.get(nonce);
  if (intent) intents.delete(nonce);
  return intent;
}
