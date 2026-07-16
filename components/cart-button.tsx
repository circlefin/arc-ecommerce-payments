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

import Link from "next/link";
import { Minus, Plus, ShoppingCart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/components/cart-provider";
import { PRODUCT_BY_ID, formatPrice } from "@/lib/products";
import { ProductMedia } from "@/components/product-media";

export function CartButton() {
  const { lines, count, currency, setQty, remove, clear } = useCart();

  // Resolve lines to products; drop any stale ids no longer in the catalog.
  const items = lines.flatMap((line) => {
    const product = PRODUCT_BY_ID[line.id];
    return product ? [{ product, qty: line.qty }] : [];
  });
  const total = items.reduce((sum, i) => sum + i.product.price * i.qty, 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          // Badge overflows the right edge (-right-1.5); me-2 keeps it from
          // crowding whatever sits to the cart's right in any header layout.
          className="relative me-2"
          aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
        >
          <ShoppingCart />
          {count > 0 && (
            <Badge className="pointer-events-none absolute -right-1.5 -bottom-1.5 h-5 min-w-5 justify-center rounded-full px-1 tabular-nums ring-2 ring-background">
              {count > 99 ? "99+" : count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 pb-0">
          <span className="text-sm font-semibold">Your cart</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {count} item{count === 1 ? "" : "s"}
            </span>
            {items.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
                  >
                    Clear
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear cart?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes all {count} item{count === 1 ? "" : "s"}{" "}
                      from your cart. This can&apos;t be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={clear}
                      className="bg-destructive/10 text-destructive hover:bg-destructive/20"
                    >
                      Clear cart
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
        <Separator />

        {items.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            Your cart is empty.
          </p>
        ) : (
          <>
            <div className="max-h-80 overflow-y-auto overscroll-contain">
              <ul className="divide-y">
                {items.map(({ product, qty }) => (
                  <li
                    key={product.id}
                    className="flex items-start gap-3 px-4 py-3"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-xl">
                      <ProductMedia product={product} className="p-1" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatPrice(product.price, currency)}
                      </p>
                      <div className="mt-2 flex items-center gap-1">
                        <Button
                          size="icon-xs"
                          variant="outline"
                          onClick={() => setQty(product.id, qty - 1)}
                          aria-label={`Decrease ${product.name}`}
                        >
                          <Minus />
                        </Button>
                        <span className="w-7 text-center text-sm tabular-nums">
                          {qty}
                        </span>
                        <Button
                          size="icon-xs"
                          variant="outline"
                          onClick={() => setQty(product.id, qty + 1)}
                          aria-label={`Increase ${product.name}`}
                        >
                          <Plus />
                        </Button>
                      </div>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => remove(product.id)}
                      aria-label={`Remove ${product.name}`}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
            <Separator />
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-sm font-semibold tabular-nums">
                {formatPrice(total, currency)}
              </span>
            </div>
            <div className="px-4 pb-4">
              <Button asChild className="w-full">
                <Link href="/checkout">Checkout</Link>
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
