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
 * admin account exists. Idempotent: creates the user if missing, otherwise just
 * ensures the `admin` role claim is set. Credentials are intentionally hardcoded
 * - this is a demo, and zero-setup matters more than secrecy here.
 *
 * Authorization is keyed off `app_metadata.role`, NOT email. `app_metadata` is
 * server-controlled and not user-editable, so it's a real authz boundary. The
 * proxy/middleware reads this same role claim from the JWT to gate `/admin`.
 *
 * Implementation note: we call createUser() first rather than listUsers() to
 * avoid a 502 race that happens when the auth service is still warming up at
 * Next.js startup. createUser() warms the connection; if the user already
 * exists (email_exists / 422) we fall back to listUsers() + updateUserById().
 */
const ADMIN_EMAIL = "admin@admin.com";
const ADMIN_PASSWORD = "123456";

export async function seedAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    console.warn(
      "[seed-admin] SUPABASE_SECRET_KEY not set - skipping admin bootstrap. " +
        "Add it to .env.local (see `supabase status`) to auto-create the admin user.",
    );
    return;
  }

  // Service-role client: bypasses RLS and can use the auth admin API. Never
  // expose this client or key to the browser.
  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        email_confirm: true,
        app_metadata: { role: "admin" },
      });

    if (!createError) {
      console.log(
        `[seed-admin] Created admin user ${ADMIN_EMAIL} (id: ${created.user.id}).`,
      );
      return;
    }

    // 422 email_exists means the user is already there — just ensure the role.
    if (
      (createError as { code?: string }).code !== "email_exists" &&
      createError.status !== 422
    ) {
      throw createError;
    }

    const { data, error: listError } = await admin.auth.admin.listUsers();
    if (listError) throw listError;

    const existing = data.users.find((u) => u.email === ADMIN_EMAIL);
    if (!existing) {
      // Shouldn't be possible, but guard anyway.
      throw new Error(`${ADMIN_EMAIL} not found after email_exists conflict`);
    }

    if (existing.app_metadata?.role !== "admin") {
      await admin.auth.admin.updateUserById(existing.id, {
        app_metadata: { role: "admin" },
      });
      console.log(`[seed-admin] Promoted ${ADMIN_EMAIL} to admin.`);
    }
  } catch (err) {
    // Don't crash the server if Supabase is unreachable at boot - the admin
    // will simply be missing until the next successful start.
    const detail =
      err instanceof Error
        ? err.message
        : JSON.stringify(err, Object.getOwnPropertyNames(err as object));
    console.error("[seed-admin] Failed to bootstrap admin user:", detail);
  }
}
