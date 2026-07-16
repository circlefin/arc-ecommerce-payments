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
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { CartButton } from "@/components/cart-button";

export async function SiteHeader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const role = (data?.claims?.app_metadata as { role?: string } | undefined)
    ?.role;
  const isAdmin = role === "admin";
  const dashboardHref = isAdmin ? "/admin" : "/account";

  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            -
          </span>
          <span className="hidden sm:inline">Arc eCommerce</span>
        </Link>
        <nav className="flex items-center gap-2">
          {signedIn ? (
            <>
              <ModeToggle />
              {!isAdmin && <CartButton />}
              <Button asChild variant="outline" size="lg">
                <Link href={dashboardHref}>Account</Link>
              </Button>
            </>
          ) : (
            <>
              <ModeToggle />
              <CartButton />
              <Button asChild variant="ghost" size="lg">
                <Link href="/auth/login">Sign in</Link>
              </Button>
              <Button asChild size="lg" className="hidden sm:inline-flex">
                <Link href="/auth/sign-up">Sign up</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
