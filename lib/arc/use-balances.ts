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

import { formatUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { ARC_CHAIN_ID } from "@/lib/arc/chain";
import { erc20Abi, tokenFor } from "@/lib/arc/tokens";
import type { Currency } from "@/lib/products";

export type TokenBalance = {
  /**
   * Spendable balance as a decimal number, or `undefined` while it is not yet
   * known - disconnected, on the wrong network, or the first read in flight.
   * Callers treat `undefined` as "unknown", never as zero.
   */
  amount: number | undefined;
  /** A read is in flight against a connected wallet on Arc. */
  isLoading: boolean;
  /** Re-read on demand (e.g. after a faucet top-up or a settled payment). */
  refetch: () => void;
};

/**
 * Live ERC-20 balance for the connected wallet on Arc, in the given currency.
 * Reads `balanceOf` straight from the token contract via wagmi; the query stays
 * disabled until a wallet is connected and on Arc Testnet, so a disconnected or
 * wrong-network shopper reads `undefined` rather than a stale or zero figure.
 */
export function useTokenBalance(currency: Currency): TokenBalance {
  const { address, chainId } = useAccount();
  const token = tokenFor(currency);
  const enabled = Boolean(address) && chainId === ARC_CHAIN_ID;

  const { data, isLoading, refetch } = useReadContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled },
  });

  return {
    amount:
      data === undefined ? undefined : Number(formatUnits(data, token.decimals)),
    isLoading: enabled && isLoading,
    refetch,
  };
}
