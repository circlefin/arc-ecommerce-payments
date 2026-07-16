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
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart-provider";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { ProductMedia } from "@/components/product-media";
import { type Currency, PRODUCTS, formatPrice } from "@/lib/products";

const CURRENCIES: Currency[] = ["USDC", "EURC"];

export function Storefront() {
  const { currency, setCurrency } = useCart();

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 pb-24">
      {/* Hero - intentionally slim, no wide banners. The cards are the star. */}
      <section className="flex flex-col items-start gap-3 py-12">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Faster checkout. Safer payments. No hidden fees.
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Pay in USDC or EURC. Reserve your gear now, charged when it ships. No
          gas, no seed phrases.
        </p>
      </section>

      {/* Catalog */}
      <section id="catalog" className="scroll-mt-20">
        <div className="flex items-center justify-between gap-4 pb-6">
          <h2 className="text-sm font-semibold tracking-[0.18em] text-foreground uppercase">
            Products
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Pay in</span>
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
        </div>

        <ul className="grid grid-cols-2 gap-x-5 gap-y-9 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {PRODUCTS.map((product) => (
            <li key={product.id} className="group relative flex flex-col">
              {/* Stretched link: the whole card navigates to the product page.
                  The add-to-cart button sits above it (z-10) so it stays clickable. */}
              <Link
                href={`/products/${product.id}`}
                className="absolute inset-0 z-10 rounded-lg"
                aria-label={product.name}
              />

              {/* Image tile */}
              <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted">
                <ProductMedia
                  product={product}
                  className="p-4 transition-transform duration-200 group-hover:scale-105"
                  emojiClassName="text-6xl transition-transform duration-200 group-hover:scale-105"
                />

                {/* Corner ribbon for NEW items. */}
                {product.badge && (
                  <span className="absolute top-3 left-3 text-[11px] font-semibold tracking-wide text-muted-foreground">
                    {product.badge}
                  </span>
                )}

                {/* Add-to-cart - the one feature. Round, floats over the tile. */}
                <AddToCartButton product={product} />
              </div>

              {/* Meta */}
              <p className="mt-3 text-[11px] tracking-wide text-muted-foreground uppercase">
                {product.category}
              </p>
              <h3 className="mt-1 text-sm leading-snug font-medium">
                {product.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatPrice(product.price, currency)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
