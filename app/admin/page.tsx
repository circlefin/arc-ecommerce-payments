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

import { createClient } from "@/lib/supabase/server";
import { OrderQueue } from "@/components/admin/order-queue";
import { AdminOrdersRealtimeSync } from "@/components/admin/orders-realtime-sync";
import type { Order, OrderItem, OrderStatus, LifecycleEvent } from "@/lib/orders";
import type { Currency } from "@/lib/products";

export default async function AdminPage() {
  const supabase = await createClient();

  // RLS is verified in the layout; the is_admin() policy grants read-all here.
  const { data: rows } = await supabase
    .from("orders")
    .select(
      "id, created_at, status, currency, total, items, payer, operator_fee, net_amount, captured_amount, refunded_amount, payment_info, lifecycle_events(operation, tx_hash, amount, note, created_at)",
    )
    .order("created_at", { ascending: false });

  const orders: Order[] = (rows ?? []).map((row) => {
    const pi = row.payment_info as { authorizationExpiry?: number } | null;
    const currency = row.currency as Currency;

    const events: LifecycleEvent[] = (
      (row.lifecycle_events as unknown as Array<{
        operation: string;
        tx_hash: string;
        amount: number | null;
        note: string | null;
        created_at: string;
      }> | null) ?? []
    )
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
      .map((e) => ({
        operation: e.operation as LifecycleEvent["operation"],
        timestamp: e.created_at,
        txHash: e.tx_hash,
        amount:
          e.amount != null
            ? `${Number(e.amount).toFixed(2)} ${currency}`
            : undefined,
        note: e.note ?? undefined,
      }));

    return {
      id: row.id,
      placed: row.created_at ?? "",
      status: row.status as OrderStatus,
      currency,
      total: Number(row.total),
      items: (row.items as OrderItem[]) ?? [],
      capturedAmount: Number(row.captured_amount ?? 0),
      refundedAmount: Number(row.refunded_amount ?? 0),
      operatorFee: Number(row.operator_fee ?? 0),
      netAmount: row.net_amount != null ? Number(row.net_amount) : undefined,
      authorizationExpiry: pi?.authorizationExpiry,
      payerAddress: row.payer
        ? `${row.payer.slice(0, 6)}...${row.payer.slice(-4)}`
        : undefined,
      events,
    };
  });

  return (
    <>
      <AdminOrdersRealtimeSync />
      <OrderQueue initialOrders={orders} />
    </>
  );
}
