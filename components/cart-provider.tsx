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

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import type { Currency } from "@/lib/products";

/** One line in the cart: a product id and how many of it. */
export type CartLine = { id: string; qty: number };

const STORAGE_KEY = "arc-cart";

// Lightweight server-readable mirror of the cart's item count. The cart itself
// stays in localStorage (invisible to the server); this cookie carries just the
// quantity so the proxy can redirect an empty-cart shopper away from /checkout
// server-side, before any markup is painted - no client-side flash. Kept in
// sync on every write() and re-asserted on mount from the localStorage truth.
const COUNT_COOKIE = "arc-cart-count";

function writeCountCookie(lines: CartLine[]) {
  if (typeof document === "undefined") return;
  const count = lines.reduce((n, l) => n + l.qty, 0);
  document.cookie = `${COUNT_COOKIE}=${count}; path=/; max-age=31536000; samesite=lax`;
}

type PersistedCart = { lines: CartLine[]; currency: Currency };

const EMPTY: PersistedCart = { lines: [], currency: "USDC" };

type CartContextValue = {
  lines: CartLine[];
  /** Total quantity across all lines (drives the header badge). */
  count: number;
  /** Currency lives here so the catalog toggle and the cart popover agree. */
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  /** Whether the signed-in user is the admin (shopping is disabled for them). */
  isAdmin: boolean;
  /** Adds to the cart. Returns false (and toasts) when blocked, e.g. for admins. */
  add: (id: string, qty?: number) => boolean;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

// localStorage is the single source of truth for the cart, read through
// useSyncExternalStore. This is the idiomatic way to bind React to a browser
// store: the server snapshot is empty (matching the SSR markup), the client
// snapshot reads localStorage, and React reconciles the two after hydration
// with no setState-in-effect. The "storage" event gives cross-tab sync for free.

const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  // Another tab writing to localStorage fires "storage" (it never fires in the
  // tab that did the write - that path goes through the explicit notify below).
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function parse(raw: string | null): PersistedCart {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedCart>;
    return {
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
      currency:
        parsed.currency === "USDC" || parsed.currency === "EURC"
          ? parsed.currency
          : "USDC",
    };
  } catch {
    // Corrupt/blocked storage - start empty, no need to surface it.
    return EMPTY;
  }
}

// getSnapshot must return a stable reference between renders or React loops, so
// cache the parsed value and only re-parse when the raw string actually changes.
let snapshot: { raw: string | null; value: PersistedCart } = {
  raw: null,
  value: EMPTY,
};

function getSnapshot(): PersistedCart {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Blocked/private-mode storage - treat as empty.
  }
  if (raw === snapshot.raw) return snapshot.value;
  snapshot = { raw, value: parse(raw) };
  return snapshot.value;
}

function getServerSnapshot(): PersistedCart {
  return EMPTY;
}

function write(next: PersistedCart) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private-mode write failures.
  }
  writeCountCookie(next.lines);
  // "storage" only fires in other tabs, so notify this tab's subscribers too.
  for (const l of listeners) l();
}

export function CartProvider({
  children,
  isAdmin = false,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  const { lines, currency } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // Re-assert the count cookie from the localStorage source of truth on load.
  // A returning shopper's cart persists in localStorage; this guarantees the
  // cookie reflects it even if it lapsed or another tab desynced it, so the
  // proxy's checkout gate never bounces a shopper who actually has items.
  useEffect(() => {
    writeCountCookie(getSnapshot().lines);
  }, [lines]);

  // Mutations derive the next cart from the live snapshot and persist it; the
  // write() notify re-runs getSnapshot and re-renders. No local React state, so
  // these callbacks never go stale and need no dependencies.
  const setCurrency = useCallback((currency: Currency) => {
    write({ ...getSnapshot(), currency });
  }, []);

  const add = useCallback(
    (id: string, qty = 1) => {
      if (isAdmin) {
        toast.error("Cannot add items to the cart while signed in as admin", {
          description: "Use a shopper account to make purchases.",
        });
        return false;
      }
      const current = getSnapshot();
      const existing = current.lines.find((l) => l.id === id);
      write({
        ...current,
        lines: existing
          ? current.lines.map((l) =>
              l.id === id ? { ...l, qty: l.qty + qty } : l,
            )
          : [...current.lines, { id, qty }],
      });
      return true;
    },
    [isAdmin],
  );

  const setQty = useCallback((id: string, qty: number) => {
    const current = getSnapshot();
    write({
      ...current,
      lines:
        qty <= 0
          ? current.lines.filter((l) => l.id !== id)
          : current.lines.map((l) => (l.id === id ? { ...l, qty } : l)),
    });
  }, []);

  const remove = useCallback((id: string) => {
    const current = getSnapshot();
    write({ ...current, lines: current.lines.filter((l) => l.id !== id) });
  }, []);

  const clear = useCallback(() => {
    write({ ...getSnapshot(), lines: [] });
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.qty, 0),
      currency,
      setCurrency,
      isAdmin,
      add,
      setQty,
      remove,
      clear,
    }),
    [lines, currency, setCurrency, isAdmin, add, setQty, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
