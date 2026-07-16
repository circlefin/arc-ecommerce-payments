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

import { zeroAddress, type Address, type Hex } from "viem";
import type { Currency } from "@/lib/products";
import { ARC_CHAIN_ID } from "@/lib/arc/chain";
import {
  RECEIVE_WITH_AUTHORIZATION_TYPES,
  tokenFor,
} from "@/lib/arc/tokens";
import { ESCROW_ABI } from "@/lib/contracts";
import { getArcPublicClient } from "@/lib/arc/public-client";
import type { PaymentInfo } from "@/lib/payments/types";

/**
 * The ERC-3009 authorization the shopper signs, and the nonce that binds it to
 * a specific PaymentInfo. The collector redeems the signature with
 * `receiveWithAuthorization(from, to=collector, value=maxAmount, validAfter=0,
 * validBefore=preApprovalExpiry, nonce, signature)`, so the signed message must
 * match those fields exactly or the on-chain `authorize`/`charge` reverts.
 */

/**
 * The collector uses a payer-agnostic PaymentInfo hash as the ERC-3009 nonce:
 * `escrow.getHash(paymentInfo)` with the `payer` field zeroed. Read it straight
 * off the deployed escrow so the nonce matches the contract's own computation
 * (chainid + escrow address + struct hash) with no risk of mis-encoding the
 * typehash off-chain.
 */
export async function payerAgnosticNonce(
  escrow: Address,
  paymentInfo: PaymentInfo,
): Promise<Hex> {
  const client = getArcPublicClient();
  return client.readContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "getHash",
    args: [{ ...paymentInfo, payer: zeroAddress }],
  }) as Promise<Hex>;
}

export type ReceiveAuthParams = {
  currency: Currency;
  /** Collector address the signature authorizes as the funds recipient. */
  collector: Address;
  /** Shopper wallet signing the authorization. */
  payer: Address;
  /** PaymentInfo `maxAmount`, in 6-decimal token units. */
  value: bigint;
  /** PaymentInfo `preApprovalExpiry` (unix seconds). */
  validBefore: number;
  /** Payer-agnostic PaymentInfo hash from `payerAgnosticNonce`. */
  nonce: Hex;
};

/**
 * EIP-712 typed data for the shopper to sign with their connected wallet. Pure;
 * runs on the client (so the bigint message fields never cross JSON). The
 * domain is the token's own ERC-3009 domain (name/version per `tokenFor`).
 */
export function buildReceiveAuthTypedData(params: ReceiveAuthParams) {
  const token = tokenFor(params.currency);
  return {
    domain: {
      name: token.eip712Name,
      version: token.eip712Version,
      chainId: ARC_CHAIN_ID,
      verifyingContract: token.address,
    },
    types: RECEIVE_WITH_AUTHORIZATION_TYPES,
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: params.payer,
      to: params.collector,
      value: params.value,
      validAfter: BigInt(0),
      validBefore: BigInt(params.validBefore),
      nonce: params.nonce,
    },
  } as const;
}
