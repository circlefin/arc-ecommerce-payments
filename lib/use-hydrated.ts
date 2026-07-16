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

import { useSyncExternalStore } from "react";

// Never-fires subscription: the value only differs between the server snapshot
// (false) and the client snapshot (true), so React flips it to true on the
// first post-hydration render and never needs to notify again.
const noop = () => () => {};

/**
 * True only after client hydration. SSR-safe and free of setState-in-effect:
 * useSyncExternalStore returns the server snapshot (false) during SSR and the
 * first client render, then the client snapshot (true) once hydrated. Use to
 * gate browser-only UI (wallet state, theme) without a mismatch.
 */
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
