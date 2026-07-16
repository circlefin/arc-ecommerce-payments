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

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { type Currency } from "@/lib/products";
import { STATUS_COPY, type OrderStatus, type LifecycleEvent } from "@/lib/orders";
import { UnderTheHood } from "@/components/order-lifecycle";
import { OrderCardHeader } from "@/components/order-card";
import { ReclaimButton } from "@/components/reclaim-button";
import { CancelButton } from "@/components/cancel-button";
import { RequestRefundButton } from "@/components/request-refund-button";
import { OrdersRealtimeSync } from "@/components/orders-realtime-sync";
import type { SerializedPaymentInfo } from "@/lib/payments/payment-info";

type OrderLineItem = { name: string; qty: number };

type OrderRow = {
  id: string;
  placed: string;
  status: OrderStatus;
  currency: Currency;
  total: number;
  items: OrderLineItem[];
  /** Unix seconds; present only for Reserved orders. */
  authorizationExpiry?: number;
  /** Unix seconds; present only for Paid/Shipped orders. */
  refundExpiry?: number;
  serializedPaymentInfo?: SerializedPaymentInfo;
  /** Onchain event log from the SCP webhook. */
  events: LifecycleEvent[];
};

export default async function AccountPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  // RLS scopes this select to the signed-in shopper's own orders.
  const { data: rows } = await supabase
    .from("orders")
    .select(
      "id, created_at, status, currency, total, items, payment_info, lifecycle_events(operation, tx_hash, amount, note, created_at)",
    )
    .order("created_at", { ascending: false });

  // eslint-disable-next-line react-hooks/purity -- async server component, runs once on the server
  const nowSeconds = Math.floor(Date.now() / 1000);

  const orders: OrderRow[] = (rows ?? []).map((row) => {
    const pi = row.payment_info as SerializedPaymentInfo | null;
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
      placed: row.created_at,
      status: row.status as OrderStatus,
      currency,
      total: Number(row.total),
      items: (row.items as OrderLineItem[]) ?? [],
      authorizationExpiry: pi?.authorizationExpiry,
      refundExpiry: pi?.refundExpiry,
      serializedPaymentInfo: pi ?? undefined,
      events,
    };
  });

  return (
    <div className="flex flex-col gap-8">
      {user && <OrdersRealtimeSync userId={user.id} />}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your orders</h1>
        <p className="text-muted-foreground">
          {orders.length === 0 ? (
            <>
              No orders yet.{" "}
              <Link href="/" className="underline underline-offset-4">
                Start shopping
              </Link>
            </>
          ) : (
            "Track every order from checkout to delivery."
          )}
        </p>
      </div>

      {orders.length > 0 && (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => {
            const canReclaim =
              order.status === "Reserved" &&
              order.authorizationExpiry !== undefined &&
              nowSeconds > order.authorizationExpiry;

            // Can cancel while Reserved and before authorization expires.
            const canCancel =
              order.status === "Reserved" && !canReclaim;

            // Can request a full refund while Paid/Shipped and within the refund window.
            const canRequestRefund =
              (order.status === "Paid" || order.status === "Shipped") &&
              (order.refundExpiry === undefined || nowSeconds < order.refundExpiry);

            return (
              <li
                key={order.id}
                className="flex flex-col gap-4 rounded-xl border bg-card p-5"
              >
                <OrderCardHeader
                  order={order}
                  badge={
                    canReclaim ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        Action needed
                      </span>
                    ) : undefined
                  }
                />

                {canReclaim ? (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      Authorization expired - you can recover your funds.
                    </p>
                    <ReclaimButton
                      orderId={order.id}
                      paymentInfo={order.serializedPaymentInfo!}
                    />
                  </div>
                ) : canCancel ? (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      {STATUS_COPY[order.status]}
                    </p>
                    <CancelButton orderId={order.id} />
                  </div>
                ) : canRequestRefund ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {STATUS_COPY[order.status]}
                    </p>
                    <RequestRefundButton orderId={order.id} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {STATUS_COPY[order.status]}
                  </p>
                )}

                <UnderTheHood
                  events={order.events}
                  escrowAddress={process.env.NEXT_PUBLIC_ESCROW_ADDRESS}
                  collectorAddress={
                    process.env.NEXT_PUBLIC_TOKEN_COLLECTOR_ADDRESS
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
