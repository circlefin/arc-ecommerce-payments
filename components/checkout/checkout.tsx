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
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Loader2,
  Minus,
  Plus,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignTypedData } from "wagmi";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useCart } from "@/components/cart-provider";
import { useHydrated } from "@/lib/use-hydrated";
import { type Currency, PRODUCT_BY_ID, formatPrice } from "@/lib/products";
import { ProductMedia } from "@/components/product-media";
import { STATUS_COPY } from "@/lib/orders";
import { ARC_CHAIN_ID, ARC_FAUCET_URL } from "@/lib/arc/chain";
import { useTokenBalance } from "@/lib/arc/use-balances";
import { type CheckoutPhase, submitCheckout } from "@/lib/checkout/submit";
import { createClient } from "@/lib/supabase/client";

const CURRENCIES: Currency[] = ["USDC", "EURC"];

type ReceiptItem = { name: string; qty: number; price: number };
type Receipt = {
  orderId: string;
  status: "Reserved";
  items: ReceiptItem[];
  total: number;
  currency: Currency;
  txHash: string;
  explorerUrl: string;
};

export function Checkout() {
  const router = useRouter();
  const { lines, currency, setCurrency, setQty, clear } = useCart();
  const hydrated = useHydrated();
  const { isConnected, chainId, address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const walletReady = isConnected && chainId === ARC_CHAIN_ID;

  const [phase, setPhase] = useState<CheckoutPhase>("idle");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const adminChannelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  // Resolve cart lines to products; drop any stale ids no longer in the catalog.
  const items = lines.flatMap((line) => {
    const product = PRODUCT_BY_ID[line.id];
    return product ? [{ product, qty: line.qty }] : [];
  });
  const total = items.reduce((sum, i) => sum + i.product.price * i.qty, 0);

  const { amount: balance, isLoading: balanceLoading } =
    useTokenBalance(currency);
  // Only block on funds once the balance is actually known; while it loads or
  // the wallet is disconnected, `balance` is undefined and we don't gate on it.
  const insufficient = balance !== undefined && total > balance;
  const busy = phase === "signing" || phase === "reserving";
  const empty = items.length === 0;

  // Snapshot whether the cart was already empty on the first hydrated render.
  // The cart is a useSyncExternalStore, so `lines` reflects localStorage on that
  // render - letting us tell "arrived with an empty cart" (bounce) apart from
  // "emptied it here by zeroing the last line" (stay put, show a message). This
  // is React's "adjust state during render" pattern: the conditional setState
  // captures the value once and re-renders immediately, no effect round-trip.
  const [arrivedEmpty, setArrivedEmpty] = useState<boolean | null>(null);
  if (hydrated && arrivedEmpty === null) {
    setArrivedEmpty(empty);
  }

  // Arrived with nothing to check out: bounce to the storefront. Gated on
  // hydration (the cart reads localStorage, so it's always empty server-side),
  // on `receipt` so the success screen - which clears the cart - stays put, and
  // on `arrivedEmpty` so emptying the cart in place doesn't redirect.
  useEffect(() => {
    if (hydrated && !receipt && empty && arrivedEmpty) {
      router.replace("/");
    }
  }, [hydrated, receipt, empty, arrivedEmpty, router]);

  useEffect(() => {
    return () => {
      if (adminChannelRef.current) {
        createClient().removeChannel(adminChannelRef.current);
      }
    };
  }, []);

  async function handlePay() {
    if (!walletReady || insufficient || busy || balanceLoading || !address)
      return;
    setError(null);
    // Snapshot the order before the cart is cleared - the success screen reads it.
    const snapshot: Omit<
      Receipt,
      "orderId" | "status" | "txHash" | "explorerUrl"
    > = {
      items: items.map((i) => ({
        name: i.product.name,
        qty: i.qty,
        price: i.product.price,
      })),
      total,
      currency,
    };
    try {
      const { orderId, status, txHash, explorerUrl } = await submitCheckout({
        currency,
        // Charge the true cart total in the token's 6-decimal units.
        amount: total.toFixed(6),
        payer: address,
        items: snapshot.items,
        signTypedDataAsync,
        onPhase: setPhase,
      });
      setReceipt({ orderId, status, txHash, explorerUrl, ...snapshot });
      setPhase("done");
      clear();

      // Notify the admin queue via client-to-client broadcast. The server-side
      // REST broadcast API is unreliable in local Supabase dev; this approach
      // uses the same WebSocket the user already has open.
      const supabase = createClient();
      const ch = supabase.channel("admin-new-orders");
      adminChannelRef.current = ch;
      ch.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          ch.send({ type: "broadcast", event: "new_order", payload: { orderId } })
            .then(() => {
              supabase.removeChannel(ch);
              adminChannelRef.current = null;
            });
        }
      });
    } catch (e) {
      setPhase("idle");
      setError(
        e instanceof Error ? e.message : "Checkout failed. Please try again."
      );
    }
  }

  // --- Success ------------------------------------------------------------
  if (receipt) {
    return <Confirmation receipt={receipt} />;
  }

  // --- Arrived empty: redirected to the storefront by the effect above ----
  // (If the cart was emptied in place we keep rendering, showing an empty-cart
  // message and a disabled pay button instead of bouncing the user out.)
  if (hydrated && empty && arrivedEmpty) {
    return null;
  }

  const payLabel = "Reserve & pay";

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      {/* Left: the steps */}
      <div className="flex flex-col gap-6">
        {/* (1) Wallet */}
        <Step n={1} title="Wallet" done={walletReady}>
          <WalletStep />
        </Step>

        {/* (2) Pay with */}
        <Step n={2} title="Pay with">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-lg border p-0.5">
              {CURRENCIES.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={currency === c ? "secondary" : "ghost"}
                  onClick={() => setCurrency(c)}
                  aria-pressed={currency === c}
                  disabled={busy}
                >
                  {c}
                </Button>
              ))}
            </div>
            <span
              className={cn(
                "text-sm tabular-nums",
                insufficient ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {balance === undefined
                ? balanceLoading
                  ? "Balance ..."
                  : "Connect wallet to see balance"
                : `Balance ${formatPrice(balance, currency)}`}
            </span>
          </div>
          {insufficient && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-destructive">
              <CircleAlert className="size-4" />
              Not enough {currency}.{" "}
              <a
                href={ARC_FAUCET_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline underline-offset-2"
              >
                Get testnet funds
              </a>
            </p>
          )}
        </Step>

        {/* (3) How it works - onchain detail kept in an optional panel. */}
        <UnderTheHood />
      </div>

      {/* Right: order summary */}
      <aside className="flex flex-col gap-4 rounded-xl border bg-card p-5 lg:sticky lg:top-24">
        <h2 className="text-sm font-semibold">Order summary</h2>
        <Separator />
        {empty ? (
          <p className="text-sm text-muted-foreground">
            Your cart is empty.{" "}
            <Link
              href="/"
              className="font-medium text-foreground underline underline-offset-2"
            >
              Keep shopping
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map(({ product, qty }) => (
              <li key={product.id} className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-lg">
                  <ProductMedia product={product} className="p-1" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{product.name}</p>
                  <div className="mt-2 flex items-center gap-1">
                    <Button
                      size="icon-xs"
                      variant="outline"
                      onClick={() => setQty(product.id, qty - 1)}
                      disabled={busy}
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
                      disabled={busy}
                      aria-label={`Increase ${product.name}`}
                    >
                      <Plus />
                    </Button>
                  </div>
                </div>
                <span className="text-sm tabular-nums">
                  {formatPrice(product.price * qty, currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Separator />
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{formatPrice(total, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Network fee</dt>
            <dd className="font-medium text-emerald-600 dark:text-emerald-400">
              Free
            </dd>
          </div>
        </dl>
        <Separator />
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-lg font-semibold tabular-nums">
            {formatPrice(total, currency)}
          </span>
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handlePay}
          disabled={
            empty || !walletReady || insufficient || busy || balanceLoading
          }
        >
          {phase === "signing" ? (
            <>
              <Loader2 className="animate-spin" />
              Confirm in your wallet
            </>
          ) : phase === "reserving" ? (
            <>
              <Loader2 className="animate-spin" />
              Reserving funds
            </>
          ) : !walletReady ? (
            "Connect a wallet to pay"
          ) : (
            payLabel
          )}
        </Button>
        {error && (
          <p className="flex items-start gap-1.5 text-center text-xs text-destructive">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Sign once. No gas. Charged when it ships.
        </p>
      </aside>
    </div>
  );
}

/** Numbered step shell with a tick once complete. */
function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
            done
              ? "bg-emerald-600 text-white dark:bg-emerald-500"
              : "bg-secondary text-secondary-foreground"
          )}
        >
          {done ? <Check className="size-3.5" /> : n}
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/**
 * Wallet connect / switch-network / connected states, styled for the page
 * (the header no longer carries a connect widget - this is the only entry
 * point). RainbowKit owns the connect + chain-switch modals; we render the
 * surface. Live onchain balance sits alongside the connected address.
 */
function WalletStep() {
  const { currency } = useCart();
  const { amount: balance, isLoading: balanceLoading } =
    useTokenBalance(currency);

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!ready) {
          return <div className="h-10" aria-hidden />;
        }

        if (!connected) {
          return (
            <div className="flex flex-col gap-2">
              <Button size="lg" onClick={openConnectModal}>
                <Wallet />
                Connect wallet
              </Button>
              <p className="text-sm text-muted-foreground">
                MetaMask, Coinbase Wallet, Rainbow, and more. Self-custody - we
                never hold your keys.
              </p>
            </div>
          );
        }

        if (chain.unsupported || chain.id !== ARC_CHAIN_ID) {
          return (
            <div className="flex flex-col gap-2">
              <Button size="lg" variant="outline" onClick={openChainModal}>
                <CircleAlert className="text-amber-600 dark:text-amber-400" />
                Switch to Arc Testnet
              </Button>
              <p className="text-sm text-muted-foreground">
                Your wallet is on the wrong network. Switch to Arc Testnet to
                pay.
              </p>
            </div>
          );
        }

        return (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-600 dark:text-emerald-400">
                <Wallet className="size-4" />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-medium">{account.displayName}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {balance === undefined
                    ? balanceLoading
                      ? "Loading balance ..."
                      : "Balance unavailable"
                    : `${formatPrice(balance, currency)} available`}
                </p>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={openAccountModal}>
              Change
            </Button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

/** Collapsible "under the hood" - the protocol detail, hidden by default. */
function UnderTheHood() {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left text-sm font-medium"
      >
        How it works
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-3 px-5 pb-5 text-sm text-muted-foreground">
          <p>
            You sign a single payment authorization in your wallet. The store
            relays it onchain and sponsors the gas, so you never pay a network
            fee or hold a gas token.
          </p>
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-foreground" />
            <span>
              Your order <strong className="text-foreground">reserves</strong>{" "}
              your funds now. You&apos;re only charged when each item ships -
              and funds auto-release if it never does.
            </span>
          </p>
        </div>
      )}
    </section>
  );
}

/** Post-payment success screen. Cart is already cleared by this point. */
/**
 * Order id with a copy button. The id is a uuid (long), so we show a short
 * prefix and copy the full value, flashing a "Copied" tooltip on click.
 */
function CopyOrderId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context / denied). Nothing to surface.
    }
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate font-mono text-sm font-medium [font-feature-settings:'liga'_0,'calt'_0]">
        {id.slice(0, 8)}
      </span>
      <TooltipProvider>
        <Tooltip open={copied}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={copy}
              aria-label="Copy order ID"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>Copied</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}

function Confirmation({ receipt }: { receipt: Receipt }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-6 py-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-600 dark:text-emerald-400">
        <Check className="size-7" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Payment reserved
        </h1>
        <p className="text-muted-foreground">{STATUS_COPY[receipt.status]}.</p>
      </div>

      <div className="w-full rounded-xl border bg-card p-5 text-left">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-sm text-muted-foreground">Order</span>
            <CopyOrderId id={receipt.orderId} />
          </div>
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {receipt.status}
          </span>
        </div>
        <Separator className="my-4" />
        <ul className="flex flex-col gap-2 text-sm">
          {receipt.items.map((item) => (
            <li key={item.name} className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                {item.qty}x {item.name}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatPrice(item.price * item.qty, receipt.currency)}
              </span>
            </li>
          ))}
        </ul>
        <Separator className="my-4" />
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="font-semibold tabular-nums">
            {formatPrice(receipt.total, receipt.currency)}
          </span>
        </div>
        <Separator className="my-4" />
        <a
          href={receipt.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <span>Onchain receipt</span>
          <span className="font-mono [font-feature-settings:'liga'_0,'calt'_0]">
            {receipt.txHash.slice(0, 10)}...{receipt.txHash.slice(-8)}
          </span>
        </a>
      </div>

      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <Button asChild className="flex-1">
          <Link href="/account">Track order</Link>
        </Button>
        <Button asChild variant="outline" className="flex-1">
          <Link href="/">Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}
