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

export type Currency = "USDC" | "EURC";

export type Product = {
  id: string;
  name: string;
  tagline: string;
  /** Base price, charged in whichever currency the shopper picks (no FX at settlement). */
  price: number;
  category: string;
  /** Optional corner ribbon ("NEW"). */
  badge?: "NEW";
  emoji: string;
  /** Transparent PNG under /public/images/products. Falls back to emoji when absent. */
  image?: string;
};

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  USDC: "$",
  EURC: "€",
};

export function formatPrice(price: number, currency: Currency): string {
  return `${CURRENCY_SYMBOL[currency]}${price.toFixed(2)} ${currency}`;
}

export const PRODUCTS: Product[] = [
  // -- Headwear -----------------------------------------------------
  {
    id: "arc-cap",
    name: "Arc Cap",
    tagline: "Six-panel, embroidered Arc mark.",
    price: 0.45,
    category: "Headwear",
    badge: "NEW",
    emoji: "🧢",
    image: "/images/products/cap.png",
  },
  // -- Tops ---------------------------------------------------------
  {
    id: "arc-polo",
    name: "Arc Polo",
    tagline: "Pima cotton, tonal Arc crest.",
    price: 0.85,
    category: "Tops",
    emoji: "👕",
    image: "/images/products/polo.png",
  },
  // -- Outerwear ----------------------------------------------------
  {
    id: "arc-fleece",
    name: "Arc Fleece",
    tagline: "Recycled pile, quarter-zip.",
    price: 1.6,
    category: "Outerwear",
    badge: "NEW",
    emoji: "🧥",
    image: "/images/products/fleece.png",
  },
];

export const PRODUCT_BY_ID: Record<string, Product> = Object.fromEntries(
  PRODUCTS.map((p) => [p.id, p]),
);

export const PRODUCT_BY_NAME: Record<string, Product> = Object.fromEntries(
  PRODUCTS.map((p) => [p.name, p]),
);
