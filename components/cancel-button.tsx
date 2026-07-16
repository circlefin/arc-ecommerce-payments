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
import { Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const ARC_EXPLORER = "https://testnet.arcscan.app/tx/";

/**
 * Shopper-initiated cancel before fulfillment.
 *
 * Shown on Reserved orders that have not yet expired. Calls
 * POST /api/account/orders/[id]/cancel, which submits escrow.void via the
 * operator DCW (sponsoring gas) and updates the order to Canceled.
 */
export function CancelButton({ orderId }: { orderId: string }) {
  const [phase, setPhase] = React.useState<"idle" | "processing" | "done">(
    "idle",
  );

  async function handleCancel() {
    setPhase("processing");
    const res = await fetch(`/api/account/orders/${orderId}/cancel`, {
      method: "POST",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Cancel failed" }));
      setPhase("idle");
      toast.error(err.error ?? "Cancel failed");
      return;
    }
    const { txHash } = await res.json();
    setPhase("done");
    toast.success("Order canceled - funds returned to your wallet", {
      description: txHash ? (
        <a
          href={ARC_EXPLORER + txHash}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline"
        >
          {txHash.slice(0, 18)}...
          <ExternalLink className="size-3" />
        </a>
      ) : undefined,
    });
  }

  if (phase === "done") return null;

  return (
    <button
      type="button"
      disabled={phase === "processing"}
      onClick={handleCancel}
      className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline underline-offset-2 transition-colors hover:text-foreground/70 disabled:opacity-50"
    >
      {phase === "processing" && <Loader2 className="size-3.5 animate-spin" />}
      {phase === "processing" ? "Canceling..." : "Cancel order"}
    </button>
  );
}
