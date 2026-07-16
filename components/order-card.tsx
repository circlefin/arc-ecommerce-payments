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
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";

import { type Order, type OrderStatus } from "@/lib/orders";
import { formatPrice, PRODUCT_BY_NAME } from "@/lib/products";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Fields shared by the merchant queue and the shopper account card. */
export type OrderCardOrder = Pick<
  Order,
  "id" | "placed" | "status" | "currency" | "total" | "items"
>;

const STATUS_BADGE: Record<OrderStatus, { label: string; className: string }> =
  {
    Reserved: {
      label: "Reserved",
      className:
        "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
    },
    Paid: {
      label: "Paid",
      className:
        "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300",
    },
    Shipped: {
      label: "Shipped",
      className:
        "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300",
    },
    Refunded: {
      label: "Refunded",
      className:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
    },
    Canceled: {
      label: "Canceled",
      className: "border-muted bg-muted text-muted-foreground",
    },
    Expired: {
      label: "Expired",
      className: "border-muted bg-muted text-muted-foreground",
    },
  };

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { label, className } = STATUS_BADGE[status];
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

type SortColumn = "item" | "price";
type SortDirection = "asc" | "desc";

function lineTotal(item: OrderCardOrder["items"][number]): number {
  return (PRODUCT_BY_NAME[item.name]?.price ?? 0) * item.qty;
}

/** Formats an order's placed timestamp the same way as the auth expiry line. */
function formatPlaced(placed: string): string {
  return new Date(placed).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrderItemsDialog({ order }: { order: OrderCardOrder }) {
  const itemCount = order.items.length;
  const [sort, setSort] = React.useState<{
    column: SortColumn;
    direction: SortDirection;
  } | null>(null);

  // Tri-state cycle per column: unsorted -> asc -> desc -> unsorted.
  function cycleSort(column: SortColumn) {
    setSort((current) => {
      if (!current || current.column !== column) {
        return { column, direction: "asc" };
      }
      if (current.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  }

  const items = React.useMemo(() => {
    if (!sort) return order.items;
    const sorted = [...order.items].sort((a, b) => {
      const cmp =
        sort.column === "item"
          ? a.name.localeCompare(b.name)
          : lineTotal(a) - lineTotal(b);
      return sort.direction === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [order.items, sort]);

  function renderSortIcon(column: SortColumn) {
    if (sort?.column !== column) {
      return <ChevronsUpDown className="size-3.5 opacity-50" />;
    }
    return sort.direction === "asc" ? (
      <ArrowUp className="size-3.5" />
    ) : (
      <ArrowDown className="size-3.5" />
    );
  }

  function ariaSort(column: SortColumn): React.AriaAttributes["aria-sort"] {
    if (sort?.column !== column) return "none";
    return sort.direction === "asc" ? "ascending" : "descending";
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-foreground/70"
        >
          View full order
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Order {order.id}</DialogTitle>
          <DialogDescription>
            {itemCount} item{itemCount === 1 ? "" : "s"} - Placed {formatPlaced(order.placed)}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead aria-sort={ariaSort("item")}>
                  <button
                    type="button"
                    onClick={() => cycleSort("item")}
                    className="inline-flex items-center gap-1 transition-colors hover:text-foreground/70"
                  >
                    Item
                    {renderSortIcon("item")}
                  </button>
                </TableHead>
                <TableHead className="text-right" aria-sort={ariaSort("price")}>
                  <button
                    type="button"
                    onClick={() => cycleSort("price")}
                    className="inline-flex items-center gap-1 transition-colors hover:text-foreground/70"
                  >
                    Price
                    {renderSortIcon("price")}
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const unitPrice = PRODUCT_BY_NAME[item.name]?.price;
                return (
                  <TableRow key={item.name}>
                    <TableCell>
                      {item.qty > 1 ? `${item.name} x${item.qty}` : item.name}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {unitPrice !== undefined
                        ? formatPrice(unitPrice * item.qty, order.currency)
                        : "-"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shared order-card header: id, status badge, item summary, placed date, and
 * total. Slots let the merchant view add admin-only details (payer address,
 * auth expiry, payment breakdown) without diverging the common layout.
 */
export function OrderCardHeader({
  order,
  badge,
  inlineMeta,
  subMeta,
  totalAside,
}: {
  order: OrderCardOrder;
  /** Overrides the default status badge (e.g. a derived display state). */
  badge?: React.ReactNode;
  /** Rendered inline after the status badge (e.g. payer address). */
  inlineMeta?: React.ReactNode;
  /** Appended to the "Placed {date}" line (e.g. auth expiry). */
  subMeta?: React.ReactNode;
  /** Rendered next to the total (e.g. payment breakdown popover). */
  totalAside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{order.id}</span>
          {badge ?? <StatusBadge status={order.status} />}
          {inlineMeta}
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Placed: </span>
          {formatPlaced(order.placed)}
          {subMeta}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Orders: </span>
          {order.items
            .slice(0, 3)
            .map((i) => (i.qty > 1 ? `${i.name} x${i.qty}` : i.name))
            .join(", ")}
          {order.items.length > 3 && (
            <>
              {" - "}
              <OrderItemsDialog order={order} />
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col items-end gap-0.5 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium">
            {formatPrice(order.total, order.currency)}
          </span>
          {totalAside}
        </div>
      </div>
    </div>
  );
}
