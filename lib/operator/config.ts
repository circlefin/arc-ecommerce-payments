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
import type { Address } from "viem";

/**
 * Operator/merchant wallet addresses, provisioned by `npm run setup`
 * and pinned in .env.local. The operator address must match the wallet behind
 * OPERATOR_WALLET_ID (it both signs PaymentInfo as `operator` and submits the
 * tx). Server-only - these back the checkout API.
 */
function required(name: string): Address {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is not set. Run \`npm run setup\`.`);
  }
  return v as Address;
}

export function operatorAddress(): Address {
  return required("OPERATOR_ADDRESS");
}

export function merchantReceiver(): Address {
  return required("MERCHANT_ADDRESS");
}
