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

"use client";

import type { Hex } from "viem";
import { buildReceiveAuthTypedData } from "@/lib/payments/authorization";
import { arcExplorerLink } from "@/lib/arc/chain";
import type { Currency } from "@/lib/products";

/**
 * Real checkout: ask the operator to build + hold the PaymentInfo, have the
 * shopper sign the ERC-3009 authorization in their own wallet, then post the
 * signature for the operator to relay (Authorize) - sponsoring gas. The signing
 * step happens between two server calls, so it has to live on the client.
 */

/** Drives the primary-button label and the wallet-signing overlay. */
export type CheckoutPhase = "idle" | "signing" | "reserving" | "done";

export type CheckoutResult = {
  orderId: string;
  status: "Reserved";
  txHash: string;
  explorerUrl: string;
};

/** The async signer from wagmi's `useSignTypedData` (typed loosely on purpose). */
type SignTypedData = (
  typedData: ReturnType<typeof buildReceiveAuthTypedData>,
) => Promise<Hex>;

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    return (await res.json()).error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function submitCheckout({
  currency,
  amount,
  payer,
  items,
  signTypedDataAsync,
  onPhase,
}: {
  currency: Currency;
  /** Order total as a decimal string in the token's units. */
  amount: string;
  payer: Hex;
  /** Cart line items, persisted with the order for display. */
  items: { name: string; qty: number; price: number }[];
  signTypedDataAsync: SignTypedData;
  onPhase: (phase: CheckoutPhase) => void;
}): Promise<CheckoutResult> {
  const intentRes = await fetch("/api/checkout/intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ currency, amount, payer, items }),
  });
  if (!intentRes.ok) {
    throw new Error(await readError(intentRes, "Could not start checkout"));
  }
  const intent: {
    nonce: Hex;
    value: string;
    preApprovalExpiry: number;
    collector: Hex;
  } = await intentRes.json();

  onPhase("signing");
  const signature = await signTypedDataAsync(
    buildReceiveAuthTypedData({
      currency,
      collector: intent.collector,
      payer,
      value: BigInt(intent.value),
      validBefore: intent.preApprovalExpiry,
      nonce: intent.nonce,
    }),
  );

  onPhase("reserving");
  const relayRes = await fetch("/api/checkout/authorize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nonce: intent.nonce, signature }),
  });
  if (!relayRes.ok) {
    throw new Error(await readError(relayRes, "Payment relay failed"));
  }
  const { txHash, orderId, status } = await relayRes.json();
  return { orderId, status, txHash, explorerUrl: arcExplorerLink("tx", txHash) };
}
