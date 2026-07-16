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

import { encodeFunctionData, zeroAddress, type Hex } from "viem";
import { randomUUID } from "node:crypto";
import { getCircleClient } from "@/lib/circle/client";
import { ESCROW_ABI, escrowAddress, tokenCollectorAddress, operatorRefundCollectorAddress } from "@/lib/contracts";
import type { PaymentInfo } from "@/lib/payments/types";

/**
 * Operator service - all Commerce Payments Protocol operations. The
 * operator is `paymentInfo.operator` and the Developer-Controlled Wallet that
 * submits each call, sponsoring Arc gas (paid in USDC) so the shopper never
 * pays it. Operations are relayed as raw `callData` (viem-encoded) through
 * Circle's contract-execution API against the deployed escrow.
 */

function operatorWalletId(): string {
  const id = process.env.OPERATOR_WALLET_ID;
  if (!id) {
    throw new Error(
      "OPERATOR_WALLET_ID is not set. Run `npm run setup` to create the operator wallet.",
    );
  }
  return id;
}

/** Submit raw callData from the operator wallet and wait for the tx hash. */
async function submit(callData: Hex): Promise<{ txHash: string }> {
  const circle = getCircleClient();
  const created = await circle.createContractExecutionTransaction({
    idempotencyKey: randomUUID(),
    walletId: operatorWalletId(),
    contractAddress: escrowAddress(),
    callData,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const id = created.data?.id;
  if (!id) throw new Error("operator: contract execution returned no transaction id");

  const done = await circle.getTransaction({ id, waitForState: "CONFIRMED" });
  const txHash = done.data?.transaction?.txHash;
  if (!txHash) {
    throw new Error(`operator: transaction ${id} reached a terminal state without a hash`);
  }
  return { txHash };
}

/**
 * Authorize: pull the shopper's signed funds into escrow, reserving the full
 * `maxAmount`. `collectorData` is the raw ERC-3009 signature the shopper made
 * over the payer-agnostic PaymentInfo hash; the ERC-3009 collector redeems it.
 */
export async function authorize(
  paymentInfo: PaymentInfo,
  collectorData: Hex,
): Promise<{ txHash: string }> {
  const callData = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "authorize",
    args: [paymentInfo, paymentInfo.maxAmount, tokenCollectorAddress(), collectorData],
  });
  return submit(callData);
}

/** Capture: release escrowed funds to the merchant; supports partials. Zero-fee demo. */
export async function capture(
  paymentInfo: PaymentInfo,
  amount: bigint,
): Promise<{ txHash: string }> {
  const callData = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "capture",
    args: [paymentInfo, amount, 0, zeroAddress],
  });
  return submit(callData);
}

/** Void: cancel an authorization, returning escrowed funds to the payer. */
export async function voidAuthorization(
  paymentInfo: PaymentInfo,
): Promise<{ txHash: string }> {
  const callData = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "void",
    args: [paymentInfo],
  });
  return submit(callData);
}

/**
 * Refund: return captured funds to the payer, full or partial.
 *
 * Uses OperatorRefundCollector (CollectorType.Refund = 1), which pulls tokens
 * FROM the operator wallet TO the payer's TokenStore via a pre-approved ERC-20
 * allowance. No merchant signature is required — the operator's standing
 * approval (set in `npm run setup`) authorizes the transfer.
 * Note the economics: the operator funds refunds out of its own balance, not
 * the merchant receiver. Captured funds already left the escrow to the
 * merchant and cannot be clawed back without the merchant's authorization, so
 * the operator fronts the refund. The merchant's net-per-order figure in the
 * admin therefore reflects captures only, not operator-funded refunds.
 */
export async function refund(
  paymentInfo: PaymentInfo,
  amount: bigint,
): Promise<{ txHash: string }> {
  const callData = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "refund",
    args: [paymentInfo, amount, operatorRefundCollectorAddress(), "0x"],
  });
  return submit(callData);
}
