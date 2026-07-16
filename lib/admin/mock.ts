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

/**
 * Mocked operator service for admin actions.
 *
 * The real flow is: the operator submits Capture / Void / Refund as Smart
 * Contract Platform ABI calls from the Developer-Controlled operator wallet,
 * sponsoring gas, and the escrow contract atomically settles funds.
 * None of that is wired yet - escrow + SCP integration is pending. These
 * stand in with timed phases so the admin UI is built against the right seam.
 * Swap the bodies for real SCP calls when the contracts are deployed on Arc.
 */

export type AdminPhase = "idle" | "processing" | "done" | "error";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function mockTxHash(): string {
  return (
    "0x" +
    Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join("")
  );
}

/** Capture: release escrowed funds to the merchant. */
export async function runMockCapture({
  onPhase,
}: {
  onPhase: (phase: AdminPhase) => void;
}): Promise<{ txHash: string }> {
  onPhase("processing");
  // Real: SCP ABI call -> escrow.capture(paymentInfo, amount) from operator wallet.
  await delay(1100);
  return { txHash: mockTxHash() };
}

/** Void: cancel authorization, returning escrowed funds to the payer. */
export async function runMockVoid({
  onPhase,
}: {
  onPhase: (phase: AdminPhase) => void;
}): Promise<{ txHash: string }> {
  onPhase("processing");
  // Real: SCP ABI call -> escrow.void(paymentInfo) from operator wallet.
  await delay(900);
  return { txHash: mockTxHash() };
}

/** Refund: return captured funds to the payer, full or partial. */
export async function runMockRefund({
  onPhase,
}: {
  onPhase: (phase: AdminPhase) => void;
}): Promise<{ txHash: string }> {
  onPhase("processing");
  // Real: SCP ABI call -> escrow.refund(paymentInfo, amount) from operator wallet.
  await delay(1000);
  return { txHash: mockTxHash() };
}
