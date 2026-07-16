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

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Invisible client component that keeps the admin order queue live.
 *
 * Two update paths:
 *
 * 1. New orders (INSERT): Supabase Realtime's postgres_changes RLS check runs
 *    `is_admin()` which reads `auth.jwt()` — this doesn't resolve correctly in
 *    the Realtime Postgres context, so INSERT events never reach the admin
 *    client. Instead, `recordOrder()` posts a server-side broadcast to
 *    "admin-orders" immediately after the INSERT. The broadcast channel has no
 *    RLS, so it always fires.
 *
 * 2. Status changes (UPDATE): triggered by the admin's own capture/void/refund
 *    actions, which call router.refresh() directly from OrderRow. The
 *    postgres_changes UPDATE subscription here is a belt-and-suspenders fallback
 *    (e.g. webhook-driven updates or a second admin tab).
 */
export function AdminOrdersRealtimeSync() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    // Dedicated broadcast-only channel for new orders. Mixing broadcast and
    // postgres_changes on the same channel prevents broadcast delivery.
    const broadcastChannel = supabase
      .channel("admin-new-orders")
      .on("broadcast", { event: "new_order" }, () => router.refresh())
      .subscribe();

    // Separate channel for order UPDATE events (capture/void/refund fallback).
    const changesChannel = supabase
      .channel("admin-order-changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(broadcastChannel);
      supabase.removeChannel(changesChannel);
    };
  }, [router]);

  return null;
}
