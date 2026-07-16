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
import { useRouter } from "next/navigation";
import { Loader2, ExternalLink, Info, Copy, Check } from "lucide-react";
import { toast } from "sonner";

import { type Order, STATUS_COPY } from "@/lib/orders";
import { formatPrice } from "@/lib/products";
import { UnderTheHood } from "@/components/order-lifecycle";
import { OrderCardHeader } from "@/components/order-card";
import { CaptureDialog } from "@/components/admin/capture-dialog";
import { RefundDialog } from "@/components/admin/refund-dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

type AdminPhase = "idle" | "processing" | "error";

const ARC_EXPLORER = "https://testnet.arcscan.app/tx/";
const ARC_ADDRESS_EXPLORER = "https://testnet.arcscan.app/address/";

function shortHash(txHash: string): string {
  return `${txHash.slice(0, 10)}...${txHash.slice(-6)}`;
}

function TxLink({ txHash }: { txHash: string }) {
  return (
    <a
      href={ARC_EXPLORER + txHash}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono underline"
    >
      {shortHash(txHash)}
      <ExternalLink className="size-3" />
    </a>
  );
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context / denied). Nothing to surface.
    }
  }

  return (
    <TooltipProvider>
      <Tooltip open={copied}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={copy}
            aria-label={label}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? (
              <Check className="size-3" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>Copied</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function PayerAddress({ address }: { address: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <a
        href={ARC_ADDRESS_EXPLORER + address}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono underline-offset-2 hover:text-foreground hover:underline"
      >
        {shortAddress(address)}
      </a>
      <CopyButton value={address} label="Copy payer address" />
    </span>
  );
}

export function OrderRow({
  order,
  onUpdate,
  nowSeconds,
}: {
  order: Order;
  onUpdate: (updated: Order) => void;
  /** Live clock from the queue so expiry-derived state stays current. */
  nowSeconds: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<AdminPhase>("idle");
  const [action, setAction] = React.useState<
    | "capture-full"
    | "capture-partial"
    | "void"
    | "refund-full"
    | "refund-partial"
    | null
  >(null);
  const busy = phase === "processing";

  const remaining = (order.total ?? 0) - (order.capturedAmount ?? 0);
  const maxRefund =
    (order.capturedAmount ?? order.total) - (order.refundedAmount ?? 0);

  async function handleCapture(amount: number, variant: "full" | "partial") {
    setAction(variant === "full" ? "capture-full" : "capture-partial");
    setPhase("processing");
    const res = await fetch(`/api/admin/orders/${order.id}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Capture failed" }));
      setPhase("error");
      setAction(null);
      toast.error(err.error ?? "Capture failed");
      return;
    }
    const { txHash, status, capturedAmount } = await res.json();
    const newCaptured = capturedAmount as number;
    const fullyCapture = newCaptured >= order.total - 0.001;
    onUpdate({ ...order, capturedAmount: newCaptured, status });
    // Optimistic onUpdate above doesn't know about the new lifecycle event
    // the capture route just inserted; refresh to pull it in immediately
    // rather than waiting on the realtime round-trip.
    router.refresh();
    setPhase("idle");
    setAction(null);
    toast.success(
      `Captured ${formatPrice(amount, order.currency)} - ${fullyCapture
        ? "order paid"
        : "partial, remaining " +
        formatPrice(order.total - newCaptured, order.currency)
      }`,
      { description: <TxLink txHash={txHash} /> }
    );
  }

  async function handleVoid() {
    setAction("void");
    setPhase("processing");
    const res = await fetch(`/api/admin/orders/${order.id}/void`, {
      method: "POST",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Void failed" }));
      setPhase("error");
      setAction(null);
      toast.error(err.error ?? "Void failed");
      return;
    }
    const { txHash } = await res.json();
    onUpdate({ ...order, status: "Canceled", capturedAmount: 0 });
    router.refresh();
    setPhase("idle");
    setAction(null);
    toast.success("Order voided - funds returned to shopper", {
      description: <TxLink txHash={txHash} />,
    });
  }

  async function handleRefund(amount: number, variant: "full" | "partial") {
    setAction(variant === "full" ? "refund-full" : "refund-partial");
    setPhase("processing");
    const res = await fetch(`/api/admin/orders/${order.id}/refund`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Refund failed" }));
      setPhase("error");
      setAction(null);
      toast.error(err.error ?? "Refund failed");
      return;
    }
    const { txHash, status, refundedAmount } = await res.json();
    const newRefunded = refundedAmount as number;
    const fullyRefunded =
      newRefunded >= (order.capturedAmount ?? order.total) - 0.001;
    onUpdate({ ...order, refundedAmount: newRefunded, status });
    router.refresh();
    setPhase("idle");
    setAction(null);
    toast.success(
      `Refunded ${formatPrice(amount, order.currency)} to shopper${fullyRefunded ? " - fully refunded" : ""
      }`,
      { description: <TxLink txHash={txHash} /> }
    );
  }

  const breakdown: { label: string; value: string }[] = [];
  if (order.operatorFee !== undefined) {
    breakdown.push({
      label: "Fee",
      value: formatPrice(order.operatorFee, order.currency),
    });
    breakdown.push({
      label: "Net",
      value: formatPrice(
        order.netAmount ?? order.total - order.operatorFee,
        order.currency
      ),
    });
  }
  if (order.status === "Reserved" && (order.capturedAmount ?? 0) > 0) {
    breakdown.push({
      label: "Captured",
      value: formatPrice(order.capturedAmount!, order.currency),
    });
    breakdown.push({
      label: "Remaining",
      value: formatPrice(remaining, order.currency),
    });
  }
  if ((order.refundedAmount ?? 0) > 0 && order.status !== "Refunded") {
    breakdown.push({
      label: "Refunded",
      value: formatPrice(order.refundedAmount!, order.currency),
    });
  }

  const authExpired =
    order.authorizationExpiry !== undefined &&
    nowSeconds > order.authorizationExpiry;
  const canCapture =
    order.status === "Reserved" && remaining > 0.001 && !authExpired;
  const canVoid = order.status === "Reserved";
  const canRefund =
    (order.status === "Paid" || order.status === "Shipped") &&
    maxRefund > 0.001;

  return (
    <li className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <OrderCardHeader
        order={order}
        badge={
          order.status === "Reserved" && authExpired ? (
            <span className="rounded-full border border-muted bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Expired
            </span>
          ) : undefined
        }
        inlineMeta={
          order.payerAddress && <PayerAddress address={order.payerAddress} />
        }
        subMeta={
          order.authorizationExpiry &&
          order.status === "Reserved" && (
            <>
              {" - "}
              <span className="font-semibold text-foreground">
                Auth {authExpired ? "expired" : "expires"}:{" "}
              </span>
              {new Date(order.authorizationExpiry * 1000).toLocaleString(
                undefined,
                { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
              )}
            </>
          )
        }
        totalAside={
          breakdown.length > 0 && (
            <Popover>
              <PopoverTrigger
                aria-label="Payment breakdown"
                className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Info className="size-3.5" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto gap-1 p-2">
                <dl className="flex flex-col gap-1">
                  {breakdown.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-baseline justify-between gap-6"
                    >
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="font-mono tabular-nums">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </PopoverContent>
            </Popover>
          )
        }
      />

      {/* Actions */}
      {(canCapture || canVoid || canRefund) && (
        <div className="flex flex-wrap items-center gap-2">
          {canCapture && (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => handleCapture(remaining, "full")}
              >
                {action === "capture-full" ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Submitting via operator...
                  </>
                ) : (
                  `Fulfill (capture ${formatPrice(remaining, order.currency)})`
                )}
              </Button>
              <CaptureDialog
                order={order}
                onCapture={(amount) => handleCapture(amount, "partial")}
                disabled={busy}
                pending={action === "capture-partial"}
              />
            </>
          )}

          {canVoid && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={busy}>
                  {action === "void" ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Submitting via operator...
                    </>
                  ) : (
                    "Void order"
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Void {order.id}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cancels the authorization and returns{" "}
                    <span className="font-medium">
                      {formatPrice(order.total, order.currency)}
                    </span>{" "}
                    to the shopper. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep order</AlertDialogCancel>
                  <AlertDialogAction onClick={handleVoid}>
                    Void order
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {canRefund && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => handleRefund(maxRefund, "full")}
              >
                {action === "refund-full" ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Submitting via operator...
                  </>
                ) : (
                  "Full refund"
                )}
              </Button>
              <RefundDialog
                order={order}
                onRefund={(amount) => handleRefund(amount, "partial")}
                disabled={busy}
                pending={action === "refund-partial"}
              />
            </>
          )}
        </div>
      )}

      {!canCapture && !canVoid && !canRefund && (
        <p className="text-sm text-muted-foreground">
          {STATUS_COPY[order.status]}
        </p>
      )}

      <UnderTheHood
        events={order.events ?? []}
        escrowAddress={process.env.NEXT_PUBLIC_ESCROW_ADDRESS}
        collectorAddress={process.env.NEXT_PUBLIC_TOKEN_COLLECTOR_ADDRESS}
      />
    </li>
  );
}
