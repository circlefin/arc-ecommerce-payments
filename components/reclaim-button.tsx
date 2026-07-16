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
import { useRouter } from "next/navigation";
import { useWriteContract, usePublicClient, useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ESCROW_ABI, escrowAddress } from "@/lib/contracts";
import {
  deserializePaymentInfo,
  type SerializedPaymentInfo,
} from "@/lib/payments/payment-info";

const ARC_EXPLORER = "https://testnet.arcscan.app/tx/";

/**
 * Shopper self-service reclaim button.
 *
 * Shown on Reserved orders whose `authorizationExpiry` has passed. The escrow's
 * `reclaim()` requires `msg.sender == paymentInfo.payer`, so the shopper's own
 * connected wallet must submit the transaction directly (the operator cannot
 * relay on their behalf for this operation). The shopper pays a small amount of
 * USDC gas, but this is the only operation that requires it.
 */
export function ReclaimButton({
  orderId,
  paymentInfo: serialized,
}: {
  orderId: string;
  paymentInfo: SerializedPaymentInfo;
}) {
  const paymentInfo = React.useMemo(
    () => deserializePaymentInfo(serialized),
    [serialized],
  );

  const router = useRouter();
  const { isConnected, isConnecting, isReconnecting } = useAccount();
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { openConnectModal } = useConnectModal();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [phase, setPhase] = React.useState<"idle" | "signing" | "confirming" | "done">("idle");

  async function handleReclaim() {
    if (!publicClient) return;

    setPhase("signing");
    let txHash: `0x${string}`;
    try {
      txHash = await writeContractAsync({
        address: escrowAddress(),
        abi: ESCROW_ABI,
        functionName: "reclaim",
        args: [paymentInfo],
      });
    } catch (err) {
      setPhase("idle");
      const msg = err instanceof Error ? err.message : "Reclaim failed";
      toast.error(msg.length > 120 ? msg.slice(0, 120) + "..." : msg);
      return;
    }

    setPhase("confirming");
    try {
      await publicClient.waitForTransactionReceipt({ hash: txHash });
    } catch {
      // tx may still be valid; proceed to update DB regardless
    }

    // Update order status in DB (webhook also handles this if registered).
    await fetch("/api/account/reclaim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId, txHash }),
    });

    setPhase("done");
    router.refresh();
    toast.success("Funds reclaimed to your wallet", {
      description: (
        <a
          href={ARC_EXPLORER + txHash}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline"
        >
          {txHash.slice(0, 18)}...
          <ExternalLink className="size-3" />
        </a>
      ),
    });
  }

  if (phase === "done") return null;

  // Wallet restore is async on load; render nothing until after hydration and
  // until reconnect settles so the connect prompt doesn't flash before an
  // existing connection is restored.
  if (!mounted || isConnecting || isReconnecting) return null;

  const busy = phase === "signing" || phase === "confirming";
  const label =
    phase === "signing"
      ? "Waiting for wallet..."
      : phase === "confirming"
        ? "Confirming..."
        : "Reclaim funds";

  if (!isConnected) {
    return (
      <button
        type="button"
        onClick={openConnectModal}
        disabled={!openConnectModal}
        className="text-sm font-medium text-foreground underline underline-offset-2 transition-colors hover:text-foreground/70 disabled:opacity-50"
      >
        Connect your wallet to reclaim
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={handleReclaim}
      className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline underline-offset-2 transition-colors hover:text-foreground/70 disabled:opacity-50"
    >
      {busy && <Loader2 className="size-3.5 animate-spin" />}
      {label}
    </button>
  );
}
