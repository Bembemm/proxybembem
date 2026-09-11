alter table public.orders
  add column if not exists fulfillment_status text;

update public.orders
set fulfillment_status = case
  when payment_status = 'approved' then 'awaiting_production'
  else 'awaiting_payment'
end
where fulfillment_status is null;

alter table public.orders
  alter column fulfillment_status set default 'awaiting_payment';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_fulfillment_status_allowed'
  ) then
    alter table public.orders
      add constraint orders_fulfillment_status_allowed
      check (
        fulfillment_status is null
        or fulfillment_status in (
          'awaiting_payment',
          'awaiting_production',
          'in_production',
          'ready_to_ship',
          'shipped',
          'completed',
          'canceled'
        )
      );
  end if;
end;
$$;

create index if not exists orders_fulfillment_status_idx
  on public.orders (fulfillment_status, created_at desc);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{2,63}$'),
  source text not null check (
    source in ('system', 'mercadopago', 'admin', 'shipment', 'notification', 'customer')
  ),
  dedupe_key text unique,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_created_idx
  on public.order_events (order_id, created_at desc);

alter table public.order_events enable row level security;
revoke all on table public.order_events from public, anon, authenticated;
grant select, insert on table public.order_events to service_role;

create table if not exists public.order_attention_flags (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  code text not null check (code ~ '^[a-z][a-z0-9_]{2,63}$'),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  source text not null check (
    source in ('system', 'mercadopago', 'admin', 'shipment', 'notification', 'customer')
  ),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (resolved_at is null or resolved_at >= opened_at)
);

create unique index if not exists order_attention_active_code_uidx
  on public.order_attention_flags (order_id, code)
  where resolved_at is null;

create index if not exists order_attention_open_idx
  on public.order_attention_flags (order_id, severity, opened_at desc)
  where resolved_at is null;

alter table public.order_attention_flags enable row level security;
revoke all on table public.order_attention_flags from public, anon, authenticated;
grant select, insert, update on table public.order_attention_flags to service_role;

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null,
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_]{2,63}$'),
  entity_id text not null check (length(entity_id) between 1 and 128),
  action text not null check (action ~ '^[a-z][a-z0-9_]{2,63}$'),
  previous_values jsonb check (
    previous_values is null or jsonb_typeof(previous_values) = 'object'
  ),
  new_values jsonb check (
    new_values is null or jsonb_typeof(new_values) = 'object'
  ),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_entity_created_idx
  on public.admin_audit_log (entity_type, entity_id, created_at desc);

create index if not exists admin_audit_admin_created_idx
  on public.admin_audit_log (admin_user_id, created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from public, anon, authenticated;
grant select, insert on table public.admin_audit_log to service_role;

create or replace function public.apply_mercadopago_payment_event(
  p_order_number text,
  p_payment_id text,
  p_incoming_status text,
  p_status_detail text,
  p_paid_cents integer,
  p_currency_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_expected_cents integer;
  v_amount_matches boolean;
  v_outcome text := 'updated';
  v_fulfillment_transitioned boolean := false;
  v_attention_code text;
begin
  select *
    into v_order
    from public.orders
   where order_number = p_order_number
   for update;

  if not found then
    return jsonb_build_object(
      'outcome', 'not_found',
      'order_number', null,
      'payment_status', null,
      'payment_id', null,
      'expected_cents', null,
      'received_cents', p_paid_cents,
      'fulfillment_status', null,
      'fulfillment_transitioned', false
    );
  end if;

  v_expected_cents := coalesce(v_order.total_cents, v_order.subtotal_cents);
  v_amount_matches := p_paid_cents = v_expected_cents and p_currency_id = 'BRL';

  -- Once approved, only the same payment may repeat approval or move to a reversal.
  if v_order.payment_status = 'approved' then
    if v_order.payment_id is distinct from p_payment_id then
      v_outcome := 'ignored';
    elsif p_incoming_status = 'approved' then
      v_outcome := 'ignored';
    elsif p_incoming_status in ('refunded', 'charged_back') then
      update public.orders
         set payment_status = p_incoming_status,
             payment_status_detail = p_status_detail,
             payment_id = p_payment_id
       where id = v_order.id
       returning * into v_order;
      v_outcome := 'updated';
    else
      v_outcome := 'ignored';
    end if;

  -- Reversal states cannot be overwritten by a different payment or a non-reversal state.
  elsif v_order.payment_status in ('refunded', 'charged_back') then
    if v_order.payment_id is distinct from p_payment_id
       or p_incoming_status not in ('refunded', 'charged_back') then
      v_outcome := 'ignored';
    else
      update public.orders
         set payment_status = p_incoming_status,
             payment_status_detail = p_status_detail,
             payment_id = p_payment_id
       where id = v_order.id
       returning * into v_order;
      v_outcome := 'updated';
    end if;

  -- Approval is trusted only when provider amount and currency match the server total.
  elsif p_incoming_status = 'approved' and not v_amount_matches then
    update public.orders
       set payment_status = 'manual_review',
           payment_status_detail = 'amount_or_currency_mismatch',
           payment_id = p_payment_id
     where id = v_order.id
     returning * into v_order;
    v_outcome := 'manual_review';

  else
    update public.orders
       set payment_status = p_incoming_status,
           payment_status_detail = p_status_detail,
           payment_id = p_payment_id
     where id = v_order.id
     returning * into v_order;
    v_outcome := 'updated';
  end if;

  if v_outcome in ('updated', 'manual_review') then
    insert into public.order_events (
      order_id,
      event_type,
      source,
      dedupe_key,
      metadata
    )
    values (
      v_order.id,
      'payment_status_changed',
      'mercadopago',
      'mercadopago:' || p_payment_id || ':' || v_order.payment_status,
      jsonb_build_object(
        'payment_id', p_payment_id,
        'payment_status', v_order.payment_status,
        'status_detail', p_status_detail,
        'expected_cents', v_expected_cents,
        'received_cents', p_paid_cents,
        'currency_id', p_currency_id
      )
    )
    on conflict (dedupe_key) do nothing;
  end if;

  if v_outcome = 'manual_review' then
    insert into public.order_attention_flags (
      order_id,
      code,
      severity,
      source,
      metadata
    )
    values (
      v_order.id,
      'payment_manual_review',
      'critical',
      'mercadopago',
      jsonb_build_object(
        'payment_id', p_payment_id,
        'expected_cents', v_expected_cents,
        'received_cents', p_paid_cents,
        'currency_id', p_currency_id
      )
    )
    on conflict do nothing;
  end if;

  if v_outcome = 'updated' and v_order.payment_status = 'approved' then
    update public.order_attention_flags
       set resolved_at = coalesce(resolved_at, now())
     where order_id = v_order.id
       and code = 'payment_manual_review'
       and resolved_at is null;

    if v_order.fulfillment_status = 'awaiting_payment' then
      update public.orders
         set fulfillment_status = 'awaiting_production'
       where id = v_order.id
       returning * into v_order;

      v_fulfillment_transitioned := true;

      insert into public.order_events (
        order_id,
        event_type,
        source,
        dedupe_key,
        metadata
      )
      values (
        v_order.id,
        'fulfillment_status_changed',
        'system',
        'payment-approved-fulfillment:' || v_order.id::text,
        jsonb_build_object(
          'from', 'awaiting_payment',
          'to', 'awaiting_production',
          'reason', 'payment_approved'
        )
      )
      on conflict (dedupe_key) do nothing;
    end if;
  end if;

  if v_outcome = 'updated' and v_order.payment_status in ('refunded', 'charged_back') then
    if v_order.payment_status = 'refunded' then
      v_attention_code := 'payment_refunded';

      update public.order_attention_flags
         set resolved_at = coalesce(resolved_at, now())
       where order_id = v_order.id
         and code = 'payment_charged_back'
         and resolved_at is null;
    else
      v_attention_code := 'payment_charged_back';

      update public.order_attention_flags
         set resolved_at = coalesce(resolved_at, now())
       where order_id = v_order.id
         and code = 'payment_refunded'
         and resolved_at is null;
    end if;

    insert into public.order_attention_flags (
      order_id,
      code,
      severity,
      source,
      metadata
    )
    values (
      v_order.id,
      v_attention_code,
      'critical',
      'mercadopago',
      jsonb_build_object(
        'payment_id', p_payment_id,
        'payment_status', v_order.payment_status,
        'status_detail', p_status_detail
      )
    )
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'outcome', v_outcome,
    'order_number', v_order.order_number,
    'payment_status', v_order.payment_status,
    'payment_id', v_order.payment_id,
    'expected_cents', v_expected_cents,
    'received_cents', p_paid_cents,
    'fulfillment_status', v_order.fulfillment_status,
    'fulfillment_transitioned', v_fulfillment_transitioned
  );
end;
$$;

revoke all on function public.apply_mercadopago_payment_event(text,text,text,text,integer,text)
  from public, anon, authenticated;
grant execute on function public.apply_mercadopago_payment_event(text,text,text,text,integer,text)
  to service_role;
