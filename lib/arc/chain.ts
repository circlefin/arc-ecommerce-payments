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

import { arcTestnet } from "viem/chains";

/**
 * Arc Testnet network constants.
 *
 * Arc uses USDC as its native gas token (18 decimals for native gas, 6 for the
 * ERC-20). The `arcTestnet` chain ships with viem, so no custom `defineChain`
 * is needed - we only re-export it plus the handful of constants the UI and
 * operator service reference directly.
 */
export const ARC_TESTNET = arcTestnet;

/** Chain ID 5042002 (hex 0x4CEF52). Verify the wallet is on this before any tx. */
export const ARC_CHAIN_ID = arcTestnet.id;

export const ARC_RPC_URL =
  process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.network";

export const ARC_EXPLORER_URL = "https://testnet.arcscan.app";

/** Where shoppers (and developers) get testnet USDC/EURC. */
export const ARC_FAUCET_URL = "https://faucet.circle.com";

/** Build an explorer link for a tx hash or address. */
export function arcExplorerLink(kind: "tx" | "address", value: string): string {
  return `${ARC_EXPLORER_URL}/${kind}/${value}`;
}
