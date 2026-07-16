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

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCart } from "@/components/cart-provider";
import type { Product } from "@/lib/products";

/**
 * The round "+" on each product tile. Adds to the cart and flashes a
 * controlled tooltip ("Added to cart") below the button - no hover needed.
 */
export function AddToCartButton({ product }: { product: Product }) {
  const { add } = useCart();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function handleAdd() {
    if (!add(product.id)) return;
    setOpen(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 1400);
  }

  return (
    <Tooltip open={open}>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          onClick={handleAdd}
          aria-label={`Add ${product.name} to cart`}
          className="absolute right-2 bottom-2 z-20 size-9 rounded-full bg-background/90 shadow-sm backdrop-blur transition-transform hover:scale-105"
        >
          <Plus />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Added to cart</TooltipContent>
    </Tooltip>
  );
}
