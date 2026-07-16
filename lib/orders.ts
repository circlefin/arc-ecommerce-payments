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

import type { Currency } from "@/lib/products";

/** A single onchain event in the payment lifecycle visualizer. */
export type LifecycleEvent = {
  operation:
  | "Authorized"
  | "Captured"
  | "Charged"
  | "Voided"
  | "Reclaimed"
  | "Refunded";
  /** ISO timestamp of the onchain event. */
  timestamp: string;
  /** Arc transaction hash. */
  txHash: string;
  /** Human-readable amount, e.g. "2.80 USDC". */
  amount?: string;
  /** Optional note, e.g. "partial". */
  note?: string;
};

/** Lifecycle states from the merchant queue, shown shopper-side. */
export type OrderStatus =
  | "Reserved"
  | "Paid"
  | "Shipped"
  | "Refunded"
  | "Canceled"
  | "Expired";

export type OrderItem = {
  name: string;
  qty: number;
};

export type Order = {
  id: string;
  placed: string;
  status: OrderStatus;
  currency: Currency;
  total: number;
  items: OrderItem[];
  /** Amount captured so far; < total means partially captured (D3). */
  capturedAmount?: number;
  /** Amount refunded so far; tracks partial refunds against captured total (D5). */
  refundedAmount?: number;
  /** Operator fee deducted atomically from captures. */
  operatorFee?: number;
  /** Net amount received by merchant after fee. */
  netAmount?: number;
  /** Unix seconds when the authorization expires; payer can Reclaim after this. */
  authorizationExpiry?: number;
  /** Shortened wallet address of the shopper (for admin display). */
  payerAddress?: string;
  /** Onchain event log from the SCP webhook. */
  events?: LifecycleEvent[];
};

/** Shopper-facing one-liner for each lifecycle state. */
export const STATUS_COPY: Record<OrderStatus, string> = {
  Reserved: "Payment reserved, charged when it ships.",
  Paid: "Payment captured, preparing your order.",
  Shipped: "On its way.",
  Refunded: "Refunded to your wallet.",
  Canceled: "Canceled, funds returned.",
  Expired: "Authorization expired, funds released.",
};

// Admin-side order queue covering all lifecycle states.
// Placeholder until the admin fetches from the orders DB table.
export const ADMIN_ORDERS: Order[] = [
  {
    id: "AE-10502",
    placed: "2026-06-10",
    status: "Reserved",
    currency: "USDC",
    total: 3.05,
    capturedAmount: 0,
    operatorFee: 0.05,
    netAmount: 3.00,
    authorizationExpiry: 1750118400,
    payerAddress: "0xd3Ad1f9C4b2E7a8D05F6c3B1a9E4d7C2f0A6b3ef",
    items: [
      { name: "Arc Cap", qty: 3 },
      { name: "Arc Polo", qty: 2 },
    ],
  },
  {
    id: "AE-10499",
    placed: "2026-06-10",
    status: "Reserved",
    currency: "EURC",
    total: 3.30,
    capturedAmount: 1.10,
    operatorFee: 0.03,
    netAmount: 3.27,
    authorizationExpiry: 1750118400,
    payerAddress: "0xa7F28b3D1e6A4c9F02B7d5E8a1C3f6B9d04Ec091",
    items: [
      { name: "Arc Polo", qty: 2 },
      { name: "Arc Fleece", qty: 1 },
    ],
  },
  {
    id: "AE-10488",
    placed: "2026-06-09",
    status: "Paid",
    currency: "USDC",
    total: 1.60,
    capturedAmount: 1.60,
    operatorFee: 0.03,
    netAmount: 1.57,
    payerAddress: "0x58bC3f9A1d7C5e2B8a04F6c1D9b3E07a2C4d7e12",
    items: [{ name: "Arc Fleece", qty: 1 }],
  },
  {
    id: "AE-10428",
    placed: "2026-06-08",
    status: "Shipped",
    currency: "USDC",
    total: 1.30,
    capturedAmount: 1.30,
    operatorFee: 0.04,
    netAmount: 1.26,
    payerAddress: "0x12349aBc5d7E0f2A4c6B8d0E1f3A5c7B9d0E5678",
    items: [
      { name: "Arc Cap", qty: 1 },
      { name: "Arc Polo", qty: 1 },
    ],
  },
  {
    id: "AE-10391",
    placed: "2026-06-07",
    status: "Canceled",
    currency: "EURC",
    total: 1.60,
    capturedAmount: 0,
    operatorFee: 0.02,
    netAmount: 1.58,
    authorizationExpiry: 1749859200,
    payerAddress: "0x9A3b1c7D4e0F6a9B2d5C8e1A4f7B0d3C6e9A8F22",
    items: [{ name: "Arc Fleece", qty: 1 }],
  },
  {
    id: "AE-10355",
    placed: "2026-06-02",
    status: "Expired",
    currency: "USDC",
    total: 0.45,
    capturedAmount: 0,
    operatorFee: 0.01,
    netAmount: 0.44,
    authorizationExpiry: 1749427200,
    payerAddress: "0xc4D57b2E9a4D1f6C0b3A8e5D2c7F4a1B9e0DE607",
    items: [{ name: "Arc Cap", qty: 1 }],
  },
  {
    id: "AE-10288",
    placed: "2026-06-05",
    status: "Refunded",
    currency: "USDC",
    total: 0.85,
    capturedAmount: 0.85,
    refundedAmount: 0.85,
    operatorFee: 0.01,
    netAmount: 0.84,
    payerAddress: "0xf0014a8C2e6F0b9D3c7A1e5B8d2F6a0C4e9B9921",
    items: [{ name: "Arc Polo", qty: 1 }],
  },
];
