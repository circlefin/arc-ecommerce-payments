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

import {
  initiateDeveloperControlledWalletsClient,
  type initiateDeveloperControlledWalletsClient as ClientFactory,
} from "@circle-fin/developer-controlled-wallets";

/**
 * Circle Developer-Controlled Wallets client for the operator/merchant backend
 * (operator submitter + merchant receiver). Backend-only - the API
 * key and entity secret must NEVER reach the browser or be committed. Keep all
 * imports of this module inside server code (route handlers / server actions).
 *
 * Register the entity secret once before use:
 * https://developers.circle.com/wallets/dev-controlled/register-entity-secret
 */
type CircleClient = ReturnType<typeof ClientFactory>;

let cached: CircleClient | null = null;

export function getCircleClient(): CircleClient {
  if (cached) return cached;

  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) {
    throw new Error(
      "Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET. Set them in .env.local - see .env.example and README.",
    );
  }

  cached = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  return cached;
}
