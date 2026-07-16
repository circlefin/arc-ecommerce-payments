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

-- Onchain event log for the Commerce Payments Protocol lifecycle visualizer.
-- One row per escrow event received via the SCP webhook. The webhook inserts
-- rows using the service-role client (bypasses RLS). Readers are shoppers
-- (own orders only) and admins (all orders).

create table public.lifecycle_events (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete cascade,
  -- Commerce Payments Protocol operation name, mirrors ScpEventName in the webhook.
  operation    text not null check (operation in (
                 'Authorized', 'Captured', 'Charged',
                 'Voided', 'Reclaimed', 'Refunded'
               )),
  -- Arc transaction hash for the explorer link.
  tx_hash      text not null,
  -- Amount involved in display units (6-decimal token, e.g. 2.800000).
  -- NULL for operations with no discrete amount (Authorized, Voided, Reclaimed).
  amount       numeric(20, 6),
  -- Free-text annotation, e.g. "partial" for partial captures/refunds.
  note         text,
  -- Arc block number for audit ordering when timestamps collide.
  block_number bigint,
  created_at   timestamptz not null default now()
);

create index lifecycle_events_order_id_idx on public.lifecycle_events (order_id);

alter table public.lifecycle_events enable row level security;

-- Shoppers can read events for their own orders; admins read everything.
-- The subquery against orders applies the orders RLS policy transparently so
-- users only ever see events for orders they can already see.
create policy "lifecycle_events_select_own_or_admin"
  on public.lifecycle_events for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = lifecycle_events.order_id
        and (o.user_id = auth.uid() or public.is_admin())
    )
  );

-- Supabase does not auto-grant DML on user-created tables.
grant select, insert on public.lifecycle_events
  to anon, authenticated, service_role;
