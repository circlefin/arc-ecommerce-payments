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
import { Copy, Check } from "lucide-react";
import { useBalance } from "wagmi";
import type { Address } from "viem";

import { ARC_CHAIN_ID } from "@/lib/arc/chain";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </button>
        </TooltipTrigger>
        <TooltipContent>Copied</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Operator wallet readout for the admin top bar: its shortened address (with a
 * copy-to-clipboard control) and live native USDC gas balance on Arc. The
 * operator submits and sponsors every checkout transaction, so this is the
 * balance to watch.
 */
export function OperatorWalletBar({ address }: { address: Address }) {
  const { data } = useBalance({ address, chainId: ARC_CHAIN_ID });

  return (
    <div className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
      <span className="inline-flex items-center gap-1.5">
        <span className="font-bold text-foreground">Address:</span>
        <span className="font-mono">{shortAddress(address)}</span>
        <CopyButton value={address} label="Copy operator address" />
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="font-bold text-foreground">Balance:</span>
        {data === undefined ? (
          <Skeleton className="h-4 w-20" />
        ) : (
          <span className="tabular-nums">
            {`${Number(data.formatted).toFixed(2)} ${data.symbol}`}
          </span>
        )}
      </span>
    </div>
  );
}
