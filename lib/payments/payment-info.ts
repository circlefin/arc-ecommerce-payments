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

import type { Address } from "viem";
import { zeroAddress } from "viem";
import type { PaymentInfo } from "@/lib/payments/types";

/**
 * Pure `PaymentInfo` construction. The operator builds this intent for every
 * order; it is the key across all six protocol operations and the struct the
 * shopper's ERC-3009 signature is bound to (via the payer-agnostic hash). No
 * network or wallet access here - parameters in, struct out.
 */

/** Default lifecycle windows, in seconds from `now`. */
export const EXPIRY_DEFAULTS = {
  /** How long the shopper's signature stays usable to fund escrow. */
  preApproval: 30, // TEST: 30s (prod 1h)
  /** After this the payer can Reclaim un-captured funds. */
  authorization: 60, // TEST: 1min (prod 7d)
  /** How long the receiver may Refund captured funds. */
  refund: 30 * 24 * 60 * 60, // 30d
} as const;

/** `PaymentInfo` with its uint256 fields as decimal strings, ready for jsonb. */
export type SerializedPaymentInfo = Omit<PaymentInfo, "maxAmount" | "salt"> & {
  maxAmount: string;
  salt: string;
};

/**
 * JSON-safe `PaymentInfo`. `maxAmount` and `salt` are bigints (uint256) that
 * JSON cannot represent, so they go to decimal strings. The full struct is
 * persisted as the operation key, so the merchant lifecycle can rebuild it.
 */
export function serializePaymentInfo(info: PaymentInfo): SerializedPaymentInfo {
  return {
    ...info,
    maxAmount: info.maxAmount.toString(),
    salt: info.salt.toString(),
  };
}

/**
 * Restore a `PaymentInfo` from its jsonb-safe serialized form. The uint256
 * fields `maxAmount` and `salt` are stored as decimal strings and must be
 * converted back to bigint before being passed to any contract call.
 */
export function deserializePaymentInfo(info: SerializedPaymentInfo): PaymentInfo {
  return {
    ...info,
    maxAmount: BigInt(info.maxAmount),
    salt: BigInt(info.salt),
  };
}

/** A random uint256 salt that disambiguates otherwise-identical intents. */
export function randomSalt(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let salt = BigInt(0);
  for (const b of bytes) salt = (salt << BigInt(8)) | BigInt(b);
  return salt;
}

export type BuildPaymentInfoParams = {
  /** Operator EOA - must equal the wallet that submits the operation. */
  operator: Address;
  /** Shopper wallet that will sign the ERC-3009 authorization. */
  payer: Address;
  /** Merchant receiver for this currency. */
  receiver: Address;
  /** USDC or EURC token address on Arc. */
  token: Address;
  /** Full amount to reserve, in 6-decimal token units. */
  maxAmount: bigint;
  /** Optional overrides; sensible demo defaults otherwise. */
  now?: number;
  preApprovalExpiry?: number;
  authorizationExpiry?: number;
  refundExpiry?: number;
  minFeeBps?: number;
  maxFeeBps?: number;
  feeReceiver?: Address;
  salt?: bigint;
};

/**
 * Build a `PaymentInfo`. The demo runs zero-fee (min=max=0, feeReceiver unused),
 * reserves the exact order total (so the captured amount equals maxAmount and
 * no excess is refunded), and uses `EXPIRY_DEFAULTS` unless overridden. The
 * three expiries must be non-decreasing (preApproval <= authorization <= refund),
 * which the escrow enforces on-chain; the defaults satisfy that.
 */
export function buildPaymentInfo(params: BuildPaymentInfoParams): PaymentInfo {
  const now = params.now ?? Math.floor(Date.now() / 1000);
  return {
    operator: params.operator,
    payer: params.payer,
    receiver: params.receiver,
    token: params.token,
    maxAmount: params.maxAmount,
    preApprovalExpiry:
      params.preApprovalExpiry ?? now + EXPIRY_DEFAULTS.preApproval,
    authorizationExpiry:
      params.authorizationExpiry ?? now + EXPIRY_DEFAULTS.authorization,
    refundExpiry: params.refundExpiry ?? now + EXPIRY_DEFAULTS.refund,
    minFeeBps: params.minFeeBps ?? 0,
    maxFeeBps: params.maxFeeBps ?? 0,
    feeReceiver: params.feeReceiver ?? zeroAddress,
    salt: params.salt ?? randomSalt(),
  };
}
