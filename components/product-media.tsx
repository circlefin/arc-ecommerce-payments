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

import { cn } from "@/lib/utils";
import type { Product } from "@/lib/products";

/**
 * Renders a product's transparent PNG when present, otherwise falls back to its
 * emoji glyph. `className` styles the image (sizing/padding/transitions);
 * `emojiClassName` styles the emoji span so each call site keeps its own scale.
 */
export function ProductMedia({
  product,
  className,
  emojiClassName,
}: {
  product: Product;
  className?: string;
  emojiClassName?: string;
}) {
  if (product.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={product.image}
        alt={product.name}
        className={cn("size-full object-contain", className)}
      />
    );
  }
  return <span className={emojiClassName}>{product.emoji}</span>;
}
