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

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart-provider";
import { type Currency, type Product, formatPrice } from "@/lib/products";

const CURRENCIES: Currency[] = ["USDC", "EURC"];

/**
 * Right-hand buy panel on the product page: currency toggle, quantity stepper,
 * and add to cart. Currency lives in the cart context so it agrees with the
 * catalog toggle and the cart popover.
 */
export function ProductDetail({ product }: { product: Product }) {
  const { currency, setCurrency, add } = useCart();
  const [qty, setQty] = useState(1);

  function handleAdd() {
    if (!add(product.id, qty)) return;
    toast.success(`Added ${qty} x ${product.name} to cart`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          {product.category}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {product.name}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-2xl font-semibold tabular-nums">
          {formatPrice(product.price, currency)}
        </span>
        <div className="flex items-center rounded-lg border p-0.5">
          {CURRENCIES.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={currency === c ? "secondary" : "ghost"}
              onClick={() => setCurrency(c)}
              aria-pressed={currency === c}
            >
              {c}
            </Button>
          ))}
        </div>
      </div>

      {/* Payment-path hint: funds Authorize at checkout, Capture on fulfillment. */}
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        Payment reserved at checkout. Charged when it ships. No gas.
      </p>

      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-lg border p-0.5">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1}
            aria-label="Decrease quantity"
          >
            <Minus />
          </Button>
          <span className="w-8 text-center text-sm tabular-nums">{qty}</span>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setQty((q) => q + 1)}
            aria-label="Increase quantity"
          >
            <Plus />
          </Button>
        </div>
        <Button size="lg" className="flex-1" onClick={handleAdd}>
          Add to cart
        </Button>
      </div>
    </div>
  );
}
