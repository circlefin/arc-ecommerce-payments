-- Prevent duplicate processing of the same on-chain event.
-- The webhook uses this constraint together with its idempotency check
-- to ensure an event can only be recorded once.
alter table public.lifecycle_events
  add constraint lifecycle_events_tx_hash_operation_key
  unique (tx_hash, operation);