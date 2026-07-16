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
 * Next.js instrumentation hook. `register()` runs once when the server process
 * starts - the right place for boot-time setup (vs. import side-effects, which
 * re-run unpredictably).
 */
export async function register() {
  // Only run in the Node.js server runtime, never in Edge or the browser.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { seedAdmin } = await import("./lib/supabase/seed-admin");
  await seedAdmin();
}
