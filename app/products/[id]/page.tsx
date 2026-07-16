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
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { ProductDetail } from "@/components/product-detail";
import { ProductMedia } from "@/components/product-media";
import { PRODUCTS, PRODUCT_BY_ID } from "@/lib/products";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ id: p.id }));
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = PRODUCT_BY_ID[id];
  if (!product) notFound();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 pb-24">
        <nav className="py-6 text-sm text-muted-foreground">
          <Link
            href="/"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Home
          </Link>
        </nav>

        <div className="grid gap-10 md:grid-cols-2">
          {/* Image tile - same treatment as the catalog cards */}
          <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-muted">
            <ProductMedia
              product={product}
              className="p-8"
              emojiClassName="text-[8rem]"
            />
            {product.badge && (
              <span className="absolute top-4 left-4 text-xs font-semibold tracking-wide text-muted-foreground">
                {product.badge}
              </span>
            )}
          </div>

          <ProductDetail product={product} />
        </div>
      </main>
    </>
  );
}
