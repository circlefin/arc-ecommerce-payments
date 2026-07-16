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

import * as React from "react";
import { type Order, type OrderStatus } from "@/lib/orders";
import { OrderRow } from "@/components/admin/order-row";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const ALL_TABS = [
  "All",
  "Reserved",
  "Paid",
  "Shipped",
  "Refunded",
  "Canceled",
  "Expired",
] as const;

type Tab = (typeof ALL_TABS)[number];

/**
 * A Reserved order whose authorization has lapsed is effectively Expired even
 * before anyone reclaims it on-chain (the DB only flips to Expired on reclaim).
 * Deriving it here lets such orders surface under the Expired tab in real time.
 */
function effectiveStatus(order: Order, nowSeconds: number): OrderStatus {
  if (
    order.status === "Reserved" &&
    order.authorizationExpiry !== undefined &&
    nowSeconds > order.authorizationExpiry
  ) {
    return "Expired";
  }
  return order.status;
}

export function OrderQueue({ initialOrders }: { initialOrders: Order[] }) {
  const [orders, setOrders] = React.useState<Order[]>(initialOrders);
  const [tab, setTab] = React.useState<Tab>("All");
  const [nowSeconds, setNowSeconds] = React.useState(() =>
    Math.floor(Date.now() / 1000),
  );

  // Tick so orders cross their authorization expiry and move tabs live.
  React.useEffect(() => {
    const id = setInterval(
      () => setNowSeconds(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, []);

  // initialOrders is a new array on every server refetch (e.g. router.refresh()
  // from AdminOrdersRealtimeSync). Adjust state during render rather than in
  // an effect (https://react.dev/learn/you-might-not-need-an-effect) so the
  // queue picks up server-driven changes without an extra render pass.
  const [prevInitialOrders, setPrevInitialOrders] = React.useState(initialOrders);
  if (initialOrders !== prevInitialOrders) {
    setPrevInitialOrders(initialOrders);
    setOrders(initialOrders);
  }

  function updateOrder(updated: Order) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  const effective = orders.map((o) => effectiveStatus(o, nowSeconds));
  const countFor = (status: OrderStatus) =>
    effective.filter((s) => s === status).length;

  const counts: Record<Tab, number> = {
    All: orders.length,
    Reserved: countFor("Reserved"),
    Paid: countFor("Paid"),
    Shipped: countFor("Shipped"),
    Refunded: countFor("Refunded"),
    Canceled: countFor("Canceled"),
    Expired: countFor("Expired"),
  };

  const visible =
    tab === "All"
      ? orders
      : orders.filter(
          (o) => effectiveStatus(o, nowSeconds) === (tab as OrderStatus),
        );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Order queue</h1>
        <p className="text-muted-foreground">
          {orders.length} order{orders.length !== 1 ? "s" : ""} - fulfill,
          void, and refund via the Commerce Payments Protocol.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          {ALL_TABS.map((t) => (
            <TabsTrigger key={t} value={t} className="flex-1 shrink-0">
              {t}
              {counts[t] > 0 && (
                <span className="ml-1 text-xs tabular-nums opacity-60">
                  {counts[t]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {ALL_TABS.map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            {visible.length === 0 ? (
              <div className="rounded-xl border bg-card px-6 py-10 text-center text-muted-foreground">
                No {t === "All" ? "" : t.toLowerCase() + " "}orders.
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {visible.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    onUpdate={updateOrder}
                    nowSeconds={nowSeconds}
                  />
                ))}
              </ul>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
