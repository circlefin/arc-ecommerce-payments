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

import type { Address, Hex } from "viem";
import type { Currency } from "@/lib/products";

/**
 * Commerce Payments Protocol shared types. `PaymentInfo` is the signed
 * payment intent used as the key across all six operations. The struct mirrors
 * the protocol's escrow contract; amounts and fee bps are expressed in the
 * token's native units (6 decimals for USDC/EURC on Arc).
 *
 * These are the operator-service / contract-call contracts - kept here so both
 * the storefront and the Node operator service share one definition.
 */
export type PaymentInfo = {
  /** Submits txs, sponsors gas, earns the fee. Bounded - cannot redirect funds. */
  operator: Address;
  /** Shopper wallet that signed the ERC-3009 authorization. */
  payer: Address;
  /** Merchant receiver (one per currency, or a multi-currency receiver). */
  receiver: Address;
  /** USDC or EURC token address on Arc (see `lib/arc/tokens`). */
  token: Address;
  /** Max amount the operator may pull/capture, in token units. */
  maxAmount: bigint;
  /** Deadline for the off-chain pre-approval (ERC-3009 signature) to be used. */
  preApprovalExpiry: number;
  /** Auth window; after this the payer can Reclaim. */
  authorizationExpiry: number;
  /** Window during which the receiver can Refund captured funds. */
  refundExpiry: number;
  minFeeBps: number;
  maxFeeBps: number;
  feeReceiver: Address;
  /** Disambiguates otherwise-identical intents. */
  salt: bigint;
};

/** The six protocol operations the demo must exercise. */
export type Operation =
  | "authorize"
  | "capture"
  | "charge"
  | "void"
  | "reclaim"
  | "refund";

/**
 * Shopper-signed ERC-3009 authorization the operator relays to fund escrow.
 * The operator submits this; the shopper never pays gas.
 */
export type SignedAuthorization = {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
  signature: Hex;
};

/** Maps a storefront order's currency onto the token used to build PaymentInfo. */
export type OrderPayment = {
  currency: Currency;
  paymentInfo: PaymentInfo;
  authorization: SignedAuthorization;
};
