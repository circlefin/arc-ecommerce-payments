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

import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

type LifecycleOperation =
  | "Authorized"
  | "Captured"
  | "Charged"
  | "Voided"
  | "Reclaimed"
  | "Refunded";

/**
 * Insert a lifecycle_events row for the "Under the hood" visualizer.
 * Uses the service-role client so callers don't need to pass a Supabase
 * instance. Errors are logged but never thrown - lifecycle recording is
 * best-effort and must not fail an already-settled payment operation.
 */
export async function insertLifecycleEvent(params: {
  orderId: string;
  operation: LifecycleOperation;
  txHash: string;
  amount?: number;
  note?: string;
}): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("lifecycle_events").insert({
    order_id: params.orderId,
    operation: params.operation,
    tx_hash: params.txHash,
    amount: params.amount ?? null,
    note: params.note ?? null,
  });
  if (error) {
    console.error(
      `[lifecycle] ${params.operation} insert failed for order ${params.orderId}:`,
      error.message,
    );
  }
}
