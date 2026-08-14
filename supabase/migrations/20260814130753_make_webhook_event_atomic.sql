-- Atomically record a lifecycle event and apply its order transition.
-- Duplicate deliveries are ignored by the UNIQUE constraint on
-- lifecycle_events(tx_hash, operation).

create or replace function public.process_webhook_event(
  p_order_id uuid,
  p_operation text,
  p_tx_hash text,
  p_amount numeric,
  p_note text,
  p_block_number bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_captured_amount numeric(20, 6);
  v_refunded_amount numeric(20, 6);
  v_total numeric(20, 6);
  v_status text;
  v_note text := p_note;
begin
  insert into public.lifecycle_events (
    order_id,
    operation,
    tx_hash,
    amount,
    note,
    block_number
  )
  values (
    p_order_id,
    p_operation,
    p_tx_hash,
    p_amount,
    p_note,
    p_block_number
  )
  on conflict (tx_hash, operation) do nothing;

  if not found then
    return false;
  end if;

  select total, captured_amount, refunded_amount
    into v_total, v_captured_amount, v_refunded_amount
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if p_operation = 'Captured' then
    v_captured_amount := v_captured_amount + coalesce(p_amount, 0);

    if v_captured_amount >= v_total - 0.0001 then
      v_status := 'Paid';
    else
      v_status := null;
      v_note := 'partial';
    end if;

    update public.orders
    set
      captured_amount = v_captured_amount,
      status = coalesce(v_status, status)
    where id = p_order_id;

  elsif p_operation = 'Refunded' then
    v_refunded_amount := v_refunded_amount + coalesce(p_amount, 0);

    if v_refunded_amount >=
       coalesce(v_captured_amount, v_total) - 0.0001 then
      v_status := 'Refunded';
    else
      v_status := null;
      v_note := 'partial';
    end if;

    update public.orders
    set
      refunded_amount = v_refunded_amount,
      status = coalesce(v_status, status)
    where id = p_order_id;

  elsif p_operation = 'Charged' then
    update public.orders
    set
      status = 'Paid',
      captured_amount = coalesce(p_amount, captured_amount)
    where id = p_order_id;

  elsif p_operation = 'Authorized' then
    update public.orders
    set status = 'Reserved'
    where id = p_order_id;

  elsif p_operation = 'Voided' then
    update public.orders
    set status = 'Canceled'
    where id = p_order_id;

  elsif p_operation = 'Reclaimed' then
    update public.orders
    set status = 'Expired'
    where id = p_order_id;

  else
    raise exception 'Unsupported webhook operation: %', p_operation;
  end if;

  update public.lifecycle_events
  set note = v_note
  where tx_hash = p_tx_hash
    and operation = p_operation;

  return true;
end;
$$;

revoke all on function public.process_webhook_event(
  uuid,
  text,
  text,
  numeric,
  text,
  bigint
) from public;

grant execute on function public.process_webhook_event(
  uuid,
  text,
  text,
  numeric,
  text,
  bigint
) to service_role;
