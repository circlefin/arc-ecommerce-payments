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

import type { Abi, Address } from "viem";
import escrowArtifact from "@/contracts/artifacts/AuthCaptureEscrow.json";
import collectorArtifact from "@/contracts/artifacts/ERC3009PaymentCollector.json";
import refundCollectorArtifact from "@/contracts/artifacts/OperatorRefundCollector.json";

/**
 * Central config of the deployed Commerce Payments Protocol contracts on Arc.
 * Addresses come from env (filled once `scripts/setup.ts`
 * runs); ABIs are pinned in `contracts/artifacts` to the protocol commit noted
 * in `contracts/README.md`. The operator service and any client read from here
 * so there is a single source of truth.
 */

/** Canonical Multicall3, present on Arc Testnet. Collector constructor dep. */
export const MULTICALL3_ADDRESS: Address =
  "0xcA11bde05977b3631167028862bE2a173976CA11";

export const ESCROW_ABI = escrowArtifact.abi as Abi;
export const ERC3009_COLLECTOR_ABI = collectorArtifact.abi as Abi;
export const OPERATOR_REFUND_COLLECTOR_ABI = refundCollectorArtifact.abi as Abi;

/** Raw creation bytecode, used by the deploy script (not the app runtime). */
export const ESCROW_BYTECODE = escrowArtifact.bytecode as `0x${string}`;
export const ERC3009_COLLECTOR_BYTECODE =
  collectorArtifact.bytecode as `0x${string}`;
export const OPERATOR_REFUND_COLLECTOR_BYTECODE =
  refundCollectorArtifact.bytecode as `0x${string}`;

/**
 * Deployed addresses, pinned via env after deployment. Throws if read before
 * deployment so callers fail loud rather than building txs against `undefined`.
 */
function required(name: string, value: string | undefined): Address {
  if (!value) {
    throw new Error(
      `${name} is not set. Deploy the contracts (npm run setup) and pin the address in .env.local.`,
    );
  }
  return value as Address;
}

export function escrowAddress(): Address {
  return required("NEXT_PUBLIC_ESCROW_ADDRESS", process.env.NEXT_PUBLIC_ESCROW_ADDRESS);
}

export function tokenCollectorAddress(): Address {
  return required(
    "NEXT_PUBLIC_TOKEN_COLLECTOR_ADDRESS",
    process.env.NEXT_PUBLIC_TOKEN_COLLECTOR_ADDRESS,
  );
}

export function operatorRefundCollectorAddress(): Address {
  return required(
    "NEXT_PUBLIC_REFUND_COLLECTOR_ADDRESS",
    process.env.NEXT_PUBLIC_REFUND_COLLECTOR_ADDRESS,
  );
}
