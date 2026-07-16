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

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
import { ModeToggle } from "@/components/mode-toggle";
import { OperatorWalletBar } from "@/components/admin/operator-wallet-bar";
import { operatorAddress } from "@/lib/operator/config";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const role = (data?.claims?.app_metadata as { role?: string } | undefined)
    ?.role;

  // Defense in depth: the proxy already gates /admin on the role claim, but
  // re-verify server-side before rendering anything admin-only.
  if (!data?.claims) redirect("/auth/login");
  if (role !== "admin") redirect("/account");

  const email = data.claims.email as string | undefined;

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              -
            </span>
            <span className="hidden sm:inline">Arc eCommerce</span>
          </Link>
          <div className="flex items-center gap-3">
            <OperatorWalletBar address={operatorAddress()} />
            {email && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                Logged in as{" "}
                <span className="font-medium text-foreground">{email}</span>
              </span>
            )}
            <ModeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <nav className="pb-6 text-sm text-muted-foreground">
          <Link
            href="/"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Return to storefront
          </Link>
        </nav>
        {children}
      </main>
    </div>
  );
}
