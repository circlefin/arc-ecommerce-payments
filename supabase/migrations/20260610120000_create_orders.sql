-- Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.
--
-- SPDX-License-Identifier: Apache-2.0

-- Orders placed through checkout. One row per Commerce Payments Protocol order.
-- The storefront inserts a row once an Authorize (goods) or Charge (instant)
-- lands on-chain. The merchant admin reads the queue and drives the rest of the
-- lifecycle (capture, void, refund, reclaim), all keyed off payment_info.

create table public.orders (
  -- The order reference shown to the shopper and used across the app. Generated
  -- by the DB on insert and returned in the same round trip.
  id              uuid primary key default gen_random_uuid(),
  -- Owning shopper. Orders are private to the buyer (and admins) via RLS.
  user_id         uuid not null references auth.users (id) on delete cascade,
  -- Shopper wallet that signed the ERC-3009 authorization (0x address).
  payer           text not null,
  -- Settlement token. Each order settles in the currency it was paid in (no FX).
  currency        text not null check (currency in ('USDC', 'EURC')),
  -- Order total in token display units (6-decimal tokens, e.g. 52.000000).
  total           numeric(20, 6) not null check (total > 0),
  -- Operator fee taken from the payment, in token units. Zero-fee demo.
  operator_fee    numeric(20, 6) not null default 0 check (operator_fee >= 0),
  -- Net to the merchant after the operator fee. Always derived from the two.
  net_amount      numeric(20, 6)
                    generated always as (total - operator_fee) stored,
  -- Released to the merchant so far (partial captures sum up to total).
  captured_amount numeric(20, 6) not null default 0 check (captured_amount >= 0),
  -- Returned to the payer so far (partial refunds).
  refunded_amount numeric(20, 6) not null default 0 check (refunded_amount >= 0),
  -- Lifecycle state, mirrored from the on-chain operations.
  status          text not null default 'Reserved'
                    check (status in (
                      'Reserved', 'Paid', 'Shipped',
                      'Refunded', 'Canceled', 'Expired'
                    )),
  -- The signed payment intent: shared key across all six protocol operations.
  -- uint256 fields (maxAmount, salt) are stored as decimal strings in the json.
  payment_info    jsonb not null,
  -- Line items for display: array of { name, qty, price }.
  items           jsonb not null default '[]'::jsonb,
  -- Hash of the Authorize/Charge transaction that opened the order.
  tx_hash         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index orders_user_id_idx on public.orders (user_id);
create index orders_status_idx on public.orders (status);
create index orders_created_at_idx on public.orders (created_at desc);

-- Keep updated_at current on every lifecycle transition.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;

-- Is the current request an admin? Mirrors the app_metadata.role claim the app
-- uses to gate /admin, so the queue stays in sync with the route guard.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- Shoppers see their own orders; admins see the whole queue.
create policy "orders_select_own_or_admin"
  on public.orders for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- Shoppers create only their own orders.
create policy "orders_insert_own"
  on public.orders for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Only admins move orders through the lifecycle.
create policy "orders_update_admin"
  on public.orders for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Supabase does not auto-grant DML on user-created tables; explicit grants
-- are required for PostgREST to access the table at all. RLS policies above
-- restrict which rows each role can actually see or modify.
grant select, insert, update, delete on public.orders
  to anon, authenticated, service_role;
