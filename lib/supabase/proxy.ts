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

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_ROUTES = ["/auth/login", "/auth/sign-up"];

// Account (orders) area - requires a regular-user session. Browsing the store
// (home, catalog, product detail) stays public so it feels like a normal
// store. Only routes that genuinely need an account are gated.
const ACCOUNT_PREFIX = "/account";

// Admin console - gated by the server-set `app_metadata.role` claim (not email),
// which the user cannot edit, so it's a real authz boundary. The admin user is
// bootstrapped on server boot (see lib/supabase/seed-admin.ts).
const ADMIN_PREFIX = "/admin";

// Checkout - a shopper-only action. Browsing the catalog is public, but buying
// requires a signed-in shopper: anonymous visitors are sent to log in, and
// admins are bounced to the console (the operator/merchant runs on backend
// Developer-Controlled Wallets - no cart, no connected wallet, so checkout is
// meaningless for them).
const CHECKOUT_PREFIX = "/checkout";

// Cart item count, mirrored from localStorage into a cookie by the cart
// provider so this server-side gate can see whether the cart is empty.
const CART_COUNT_COOKIE = "arc-cart-count";

// True when pathname is the prefix itself or a path nested under it.
const isUnder = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // With Fluid compute, don't put this client in a global variable. Always
  // create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims(). A simple mistake
  // could make it very hard to debug issues with users being randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = AUTH_ROUTES.includes(pathname);
  const isAccountRoute = isUnder(pathname, ACCOUNT_PREFIX);
  const isAdminRoute = isUnder(pathname, ADMIN_PREFIX);
  const isCheckoutRoute = isUnder(pathname, CHECKOUT_PREFIX);
  const isAdmin =
    (user?.app_metadata as { role?: string } | undefined)?.role === "admin";

  // Each role has a different home. Admins live in the admin console and never
  // see the user-facing account/orders area.
  const homeForUser = isAdmin ? "/admin" : "/account";

  // Signed-in users shouldn't see the auth screens - send them to their home.
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = homeForUser;
    return NextResponse.redirect(url);
  }

  // Account (orders) routes are for regular users. Anonymous visitors must log
  // in; admins are redirected to the admin console - they never view orders.
  if (isAccountRoute) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      return NextResponse.redirect(url);
    }
    if (isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
  }

  // Checkout is a shopper action. Anonymous visitors must log in first; admins
  // can browse the public storefront but never buy - bounce them to the console.
  if (isCheckoutRoute) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      // Remember where they were headed so auth can return them to checkout
      // instead of the default account home.
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
  }

  // Nothing in the cart, nothing to check out. The cart lives in localStorage
  // (invisible here), but the provider mirrors its item count into a cookie, so
  // we can bounce an empty-cart shopper to the storefront server-side - before
  // any markup paints, with no client-side flash. The in-page effect is a
  // belt-and-suspenders fallback for the rare cookie/localStorage desync.
  if (isCheckoutRoute) {
    const cartCount = Number(request.cookies.get(CART_COUNT_COOKIE)?.value);
    if (!cartCount) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  // Admin routes require an admin role. Anonymous users go to login; signed-in
  // non-admins are bounced to their account.
  if (isAdminRoute && !isAdmin) {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/account" : "/auth/login";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: return the supabaseResponse object as-is to keep browser and
  // server cookies in sync. Creating a fresh NextResponse without copying its
  // cookies will terminate sessions prematurely.
  return supabaseResponse;
}
