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

import { createPublicClient, http, type PublicClient } from "viem";
import { ARC_TESTNET, ARC_RPC_URL } from "@/lib/arc/chain";

/**
 * Shared read-only viem client for Arc Testnet, for server-side reads (e.g.
 * computing the payer-agnostic nonce off the deployed escrow). Cached so route
 * handlers reuse one transport. Client components read via wagmi instead.
 */
let cached: PublicClient | null = null;

export function getArcPublicClient(): PublicClient {
  if (!cached) {
    cached = createPublicClient({
      chain: ARC_TESTNET,
      transport: http(ARC_RPC_URL),
    });
  }
  return cached;
}
