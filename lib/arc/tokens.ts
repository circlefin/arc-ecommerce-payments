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

import { erc20Abi, type Address } from "viem";
import type { Currency } from "@/lib/products";

/**
 * Token config for Arc Testnet. Both USDC and EURC are 6-decimal ERC-20s and
 * both support ERC-3009 `receiveWithAuthorization`, which is how the shopper
 * authorizes a gasless pull into escrow. Addresses are pinned here so
 * `PaymentInfo` can be parametrized by the chosen currency.
 */
export type TokenConfig = {
  currency: Currency;
  address: Address;
  decimals: number;
  /** ERC-3009 EIP-712 domain `name`, used when the shopper signs the pull. */
  eip712Name: string;
  eip712Version: string;
};

export const TOKENS: Record<Currency, TokenConfig> = {
  USDC: {
    currency: "USDC",
    address: "0x3600000000000000000000000000000000000000",
    decimals: 6,
    // EIP-712 domain `name`/`version` must match the token contract exactly or
    // the ERC-3009 signature fails to recover. Verified on-chain: Arc USDC
    // reports name "USDC" (not "USD Coin"), version "2".
    eip712Name: "USDC",
    eip712Version: "2",
  },
  EURC: {
    currency: "EURC",
    address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    decimals: 6,
    eip712Name: "EURC",
    eip712Version: "2",
  },
};

export function tokenFor(currency: Currency): TokenConfig {
  return TOKENS[currency];
}

/** Reverse-lookup: token address -> currency. Throws on unknown address. */
export function currencyForToken(address: Address): Currency {
  const entry = Object.values(TOKENS).find(
    (t) => t.address.toLowerCase() === address.toLowerCase(),
  );
  if (!entry) throw new Error(`currencyForToken: unknown token address ${address}`);
  return entry.currency;
}

/** Standard ERC-20 surface (balances, allowance) - re-exported from viem. */
export { erc20Abi };

/**
 * ERC-3009 fragment the collector invokes on the token. The Commerce Payments
 * `ERC3009PaymentCollector` calls `receiveWithAuthorization` (not the transfer
 * variant): `to` is the collector itself, and because `receive*` requires
 * `msg.sender == to`, only the collector can redeem the shopper's signature -
 * front-running protection. Works for EOA wallets, no ERC-1271 needed.
 */
export const erc3009Abi = [
  {
    type: "function",
    name: "receiveWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

/**
 * EIP-712 types for the message the shopper signs in their connected wallet.
 * Mirrors the collector's `receiveWithAuthorization` call. The signed `to` is
 * the collector address, `value` is the PaymentInfo `maxAmount`, `validBefore`
 * is `preApprovalExpiry`, and `nonce` is the payer-agnostic PaymentInfo hash.
 */
export const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;
