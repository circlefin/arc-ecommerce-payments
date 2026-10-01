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

import { createClient } from "@supabase/supabase-js";

/**
 * Demo admin bootstrap.
 *
 * Runs once on server boot (see `instrumentation.ts`) and guarantees a single
 * admin account exists. Idempotent: ensures the `admin` role claim is set on the
 * configured administrator identity.
 *
 * Security note — this function no longer provisions a credential. It previously created
 * (or reset the role of) `admin@admin.com` with the hardcoded password `123456` on every
 * server start, from a git-tracked file. That value is public, so every deployment of this
 * app shipped a known-credential account holding `app_metadata.role === "admin"` — and that
 * role is the sole gate on `/api/admin/orders/[id]/capture`, `/refund` and `/void`, i.e. the
 * merchant's funds. Admins must now be provisioned out of band:
 *
 *   1. Create the user (Supabase dashboard, CLI, or `auth.admin.inviteUserByEmail`).
 *   2. Set `app_metadata.role = "admin"` on that user.
 *   3. Set `ADMIN_EMAIL` in the environment to the same address.
 *
 * Authorization is keyed off `app_metadata.role`, NOT email. `app_metadata` is
 * server-controlled and not user-editable, so it's a real authz boundary. The
 * proxy/middleware reads this same role claim from the JWT to gate `/admin`.
 */

/**
 * Returns the configured administrator email.
 *
 * Throws when unset: with no configured identity there is no way to decide who the admin
 * is, so this must fail loudly rather than silently fall back to a default address.
 */
function getAdminEmail(): string {
  const email = process.env.ADMIN_EMAIL?.trim();

  if (!email) {
    throw new Error(
      "[seed-admin] ADMIN_EMAIL is not configured. Provision the administrator out of band " +
        "and set ADMIN_EMAIL; this module will not create accounts or passwords.",
    );
  }

  return email;
}

export async function seedAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    console.warn(
      "[seed-admin] SUPABASE_SECRET_KEY not set - skipping admin role check. " +
        "Add it to .env.local (see `supabase status`) to verify the admin role claim.",
    );
    return;
  }

  // Service-role client: bypasses RLS and can use the auth admin API. Never
  // expose this client or key to the browser.
  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let adminEmail: string;
  try {
    adminEmail = getAdminEmail();
  } catch (err) {
    // Not fatal: the app still boots, but the misconfiguration must be visible.
    console.error("[seed-admin]", err instanceof Error ? err.message : String(err));
    return;
  }

  try {
    // Verify the operator-provisioned administrator exists and carries the admin role.
    // This function never creates a user and never sets a password.
    const { data, error: listError } = await admin.auth.admin.listUsers();
    if (listError) throw listError;

    const existing = data.users.find(
      (u) => u.email?.toLowerCase() === adminEmail.toLowerCase(),
    );

    if (!existing) {
      console.warn(
        `[seed-admin] No user found for ADMIN_EMAIL=${adminEmail}. ` +
          "Create and promote the administrator manually; no account was created.",
      );
      return;
    }

    if (existing.app_metadata?.role !== "admin") {
      await admin.auth.admin.updateUserById(existing.id, {
        app_metadata: { role: "admin" },
      });
      console.log(`[seed-admin] Granted the admin role to ${adminEmail}.`);
    }
  } catch (err) {
    // Don't crash the server if Supabase is unreachable at boot - the admin
    // will simply be missing until the next successful start.
    const detail =
      err instanceof Error
        ? err.message
        : JSON.stringify(err, Object.getOwnPropertyNames(err as object));
    console.error("[seed-admin] Failed to verify the admin user:", detail);
  }
}
