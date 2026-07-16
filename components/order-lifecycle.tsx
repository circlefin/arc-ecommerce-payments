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
import { ChevronDown, ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import { type LifecycleEvent } from "@/lib/orders";

// Re-export so existing imports from this module keep working.
export type { LifecycleEvent };

const ARC_EXPLORER = "https://testnet.arcscan.app/tx/";

// --- Operation metadata ---

const OP_META: Record<
  LifecycleEvent["operation"],
  { color: string; dot: string; label: string; description: string }
> = {
  Authorized: {
    color: "text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
    label: "Authorized",
    description: "Funds escrowed - shopper signed ERC-3009, operator relayed to contract.",
  },
  Captured: {
    color: "text-green-600 dark:text-green-400",
    dot: "bg-green-500",
    label: "Captured",
    description: "Escrowed funds released to merchant receiver.",
  },
  Charged: {
    color: "text-green-600 dark:text-green-400",
    dot: "bg-green-500",
    label: "Charged",
    description: "Authorize + capture in one atomic transaction (instant/digital items).",
  },
  Voided: {
    color: "text-muted-foreground",
    dot: "bg-muted-foreground",
    label: "Voided",
    description: "Authorization canceled - escrowed funds returned to shopper.",
  },
  Reclaimed: {
    color: "text-muted-foreground",
    dot: "bg-muted-foreground",
    label: "Reclaimed",
    description: "Shopper self-recovered funds after authorization deadline passed.",
  },
  Refunded: {
    color: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    label: "Refunded",
    description: "Captured funds returned to shopper by merchant.",
  },
};

// --- Per-event row ---

function EventRow({ event }: { event: LifecycleEvent }) {
  const meta = OP_META[event.operation];
  const time = new Date(event.timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="flex gap-3">
      {/* Timeline dot */}
      <div className="flex flex-col items-center pt-1">
        <span className={`size-2 rounded-full ${meta.dot} mt-1 flex-shrink-0`} />
        <span className="mt-1 w-px flex-1 bg-border" />
      </div>

      <div className="flex flex-col gap-0.5 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-medium ${meta.color}`}>
            {meta.label}
          </span>
          {event.amount && (
            <span className="font-mono text-sm">{event.amount}</span>
          )}
          <span className="text-sm text-muted-foreground">{time}</span>
        </div>
        <p className="text-sm text-muted-foreground">{meta.description}</p>
        {event.note && (
          <p className="text-sm text-muted-foreground italic">{event.note}</p>
        )}
        <a
          href={ARC_EXPLORER + event.txHash}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 inline-flex items-center gap-1 font-mono text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {event.txHash.slice(0, 10)}...{event.txHash.slice(-6)}
          <ExternalLink className="size-3" />
        </a>
      </div>
    </li>
  );
}

// --- Lifecycle visualizer ---

export function OrderLifecycle({ events }: { events: LifecycleEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No onchain events yet. Events appear here as the order progresses.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {events.map((e, i) => (
        <EventRow key={`${e.operation}-${i}`} event={e} />
      ))}
    </ul>
  );
}

// --- "Under the hood" collapsible panel ---

export type UnderTheHoodProps = {
  /** Protocol events from onchain (empty until webhooks land). */
  events: LifecycleEvent[];
  /** Escrow contract address on Arc. */
  escrowAddress?: string;
  /** Token collector address on Arc. */
  collectorAddress?: string;
};

export function UnderTheHood({
  events,
  escrowAddress,
  collectorAddress,
}: UnderTheHoodProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="rounded-xl border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
      >
        <span>Details</span>
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t px-4 pb-4 pt-3">
          {/* Protocol info */}
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Protocol:</span>{" "}
              Commerce Payments Protocol escrow on Arc Testnet (chain 5042002)
            </p>
            {escrowAddress && (
              <p>
                <span className="font-medium text-foreground">
                  Escrow contract:
                </span>{" "}
                <a
                  href={`https://testnet.arcscan.app/address/${escrowAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono underline-offset-2 hover:underline"
                >
                  {escrowAddress}
                </a>
              </p>
            )}
            {collectorAddress && (
              <p>
                <span className="font-medium text-foreground">
                  Token collector:
                </span>{" "}
                <a
                  href={`https://testnet.arcscan.app/address/${collectorAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono underline-offset-2 hover:underline"
                >
                  {collectorAddress}
                </a>
              </p>
            )}
            {!escrowAddress && (
              <p className="italic">
                Contract addresses will appear here once deployed via SCP.
              </p>
            )}
          </div>

          {/* Operation sequence */}
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Onchain event log</p>
            <OrderLifecycle events={events} />
          </div>
        </div>
      )}
    </div>
  );
}
