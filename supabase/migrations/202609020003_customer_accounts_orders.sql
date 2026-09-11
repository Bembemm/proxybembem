alter table public.orders
  add column if not exists customer_email text,
  add column if not exists customer_id uuid references auth.users(id) on delete set null;

alter table public.orders
  add constraint orders_customer_email_normalized_chk
  check (
    customer_email is null
    or (
      customer_email = lower(btrim(customer_email))
      and char_length(customer_email) between 3 and 254
      and customer_email !~ '[[:space:]]'
      and customer_email ~ '^[^@]+@[^@]+\.[^@]+$'
    )
  );

create index if not exists orders_customer_id_created_idx
  on public.orders (customer_id, created_at desc)
  where customer_id is not null;

create table if not exists public.customer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 3 and 100),
  whatsapp text not null check (whatsapp ~ '^\d{10,11}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_customer_profiles_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_customer_profiles_updated_at on public.customer_profiles;
create trigger set_customer_profiles_updated_at
before update on public.customer_profiles
for each row
execute function public.set_customer_profiles_updated_at();

alter table public.customer_profiles enable row level security;

revoke all on table public.customer_profiles from public, anon, authenticated;
grant select, insert, update on table public.customer_profiles to authenticated;

drop policy if exists customer_profiles_select_own on public.customer_profiles;
create policy customer_profiles_select_own
on public.customer_profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists customer_profiles_insert_own on public.customer_profiles;
create policy customer_profiles_insert_own
on public.customer_profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists customer_profiles_update_own on public.customer_profiles;
create policy customer_profiles_update_own
on public.customer_profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.customer_list_orders(
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid();
  v_total bigint;
  v_orders jsonb;
begin
  if v_customer_id is null then
    raise insufficient_privilege using message = 'authentication required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'invalid limit' using errcode = '22023';
  end if;

  if p_offset is null or p_offset < 0 or p_offset > 10000 then
    raise exception 'invalid offset' using errcode = '22023';
  end if;

  select count(*)
    into v_total
    from public.orders o
   where o.customer_id = v_customer_id;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', q.id,
               'order_number', q.order_number,
               'subtotal_cents', q.subtotal_cents,
               'total_cents', q.total_cents,
               'payment_status', q.payment_status,
               'fulfillment_status', q.fulfillment_status,
               'created_at', q.created_at,
               'shipping_service_name', q.shipping_service_name,
               'shipping_carrier_name', q.shipping_carrier_name,
               'shipping_delivery_days', q.shipping_delivery_days
             )
             order by q.created_at desc, q.id desc
           ),
           '[]'::jsonb
         )
    into v_orders
    from (
      select
        o.id,
        o.order_number,
        o.subtotal_cents,
        o.total_cents,
        o.payment_status,
        o.fulfillment_status,
        o.created_at,
        o.shipping_service_name,
        o.shipping_carrier_name,
        o.shipping_delivery_days
      from public.orders o
      where o.customer_id = v_customer_id
      order by o.created_at desc, o.id desc
      limit p_limit
      offset p_offset
    ) q;

  return jsonb_build_object(
    'orders', v_orders,
    'total', v_total
  );
end;
$$;

revoke all on function public.customer_list_orders(integer,integer)
  from public, anon;
grant execute on function public.customer_list_orders(integer,integer)
  to authenticated;

create or replace function public.customer_get_order(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid();
  v_order record;
  v_timeline jsonb;
begin
  if v_customer_id is null then
    raise insufficient_privilege using message = 'authentication required';
  end if;

  select
    o.id,
    o.order_number,
    o.items,
    o.subtotal_cents,
    o.shipping_cents,
    o.total_cents,
    o.payment_status,
    o.fulfillment_status,
    o.created_at,
    o.updated_at,
    o.shipping_service_name,
    o.shipping_carrier_name,
    o.shipping_delivery_days,
    o.customer_name,
    o.whatsapp,
    o.customer_email,
    o.address_street,
    o.address_number,
    o.address_complement,
    o.address_neighborhood,
    o.address_city,
    o.address_state
  into v_order
  from public.orders o
  where o.id = p_order_id
    and o.customer_id = v_customer_id;

  if not found then
    return null;
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'kind', t.kind,
               'created_at', t.created_at
             )
             order by t.created_at, t.id
           ),
           '[]'::jsonb
         )
    into v_timeline
    from (
      select
        ev.id,
        ev.created_at,
        case
          when ev.event_type = 'payment_status_changed'
            and ev.metadata ->> 'payment_status' = 'approved'
            then 'payment_approved'
          when ev.event_type = 'payment_status_changed'
            and ev.metadata ->> 'payment_status' in ('refunded', 'charged_back')
            then 'payment_reversed'
          when ev.event_type = 'fulfillment_status_changed'
            and ev.metadata ->> 'to' = 'in_production'
            then 'production_started'
          when ev.event_type = 'fulfillment_status_changed'
            and ev.metadata ->> 'to' = 'ready_to_ship'
            then 'ready_to_ship'
          when ev.event_type = 'fulfillment_status_changed'
            and ev.metadata ->> 'to' = 'shipped'
            then 'shipped'
          when ev.event_type = 'fulfillment_status_changed'
            and ev.metadata ->> 'to' = 'completed'
            then 'completed'
          when ev.event_type = 'fulfillment_status_changed'
            and ev.metadata ->> 'to' = 'canceled'
            then 'canceled'
          else null
        end as kind
      from public.order_events ev
      where ev.order_id = p_order_id
    ) t
    where t.kind is not null;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'items', v_order.items,
    'subtotal_cents', v_order.subtotal_cents,
    'shipping_cents', v_order.shipping_cents,
    'total_cents', v_order.total_cents,
    'payment_status', v_order.payment_status,
    'fulfillment_status', v_order.fulfillment_status,
    'created_at', v_order.created_at,
    'updated_at', v_order.updated_at,
    'shipping_service_name', v_order.shipping_service_name,
    'shipping_carrier_name', v_order.shipping_carrier_name,
    'shipping_delivery_days', v_order.shipping_delivery_days,
    'customer_name', v_order.customer_name,
    'whatsapp', v_order.whatsapp,
    'customer_email', v_order.customer_email,
    'address_street', v_order.address_street,
    'address_number', v_order.address_number,
    'address_complement', v_order.address_complement,
    'address_neighborhood', v_order.address_neighborhood,
    'address_city', v_order.address_city,
    'address_state', v_order.address_state,
    'timeline', v_timeline
  );
end;
$$;

revoke all on function public.customer_get_order(uuid)
  from public, anon;
grant execute on function public.customer_get_order(uuid)
  to authenticated;

create or replace function public.claim_guest_order_for_customer(
  p_public_token text,
  p_customer_id uuid,
  p_verified_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_order_id uuid;
  v_order_number text;
  v_order_email text;
  v_existing_customer_id uuid;
begin
  if p_public_token is null
     or p_public_token !~ '^[A-Fa-f0-9]{64}$'
     or p_customer_id is null
     or p_verified_email is null
     or p_verified_email <> lower(btrim(p_verified_email))
     or char_length(p_verified_email) > 254
     or p_verified_email ~ '[[:space:]]'
     or p_verified_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    return jsonb_build_object('outcome', 'not_claimable');
  end if;

  perform 1
    from auth.users u
   where u.id = p_customer_id
     and u.email_confirmed_at is not null
     and lower(btrim(u.email)) = p_verified_email;

  if not found then
    return jsonb_build_object('outcome', 'not_claimable');
  end if;

  v_token := lower(p_public_token);

  select
    o.id,
    o.order_number,
    o.customer_email,
    o.customer_id
  into
    v_order_id,
    v_order_number,
    v_order_email,
    v_existing_customer_id
  from public.orders o
  where o.public_token = v_token
  for update;

  if not found
     or v_order_email is null
     or v_order_email <> p_verified_email then
    return jsonb_build_object('outcome', 'not_claimable');
  end if;

  if v_existing_customer_id = p_customer_id then
    return jsonb_build_object(
      'outcome', 'already_claimed',
      'order_id', v_order_id,
      'order_number', v_order_number
    );
  end if;

  if v_existing_customer_id is not null then
    return jsonb_build_object('outcome', 'not_claimable');
  end if;

  update public.orders
     set customer_id = p_customer_id
   where id = v_order_id;

  insert into public.order_events (
    order_id,
    event_type,
    source,
    dedupe_key,
    metadata
  )
  values (
    v_order_id,
    'customer_order_claimed',
    'customer',
    'customer-claim:' || v_order_id::text || ':' || p_customer_id::text,
    jsonb_build_object('claim_method', 'verified_email_and_public_token')
  )
  on conflict (dedupe_key) do nothing;

  return jsonb_build_object(
    'outcome', 'claimed',
    'order_id', v_order_id,
    'order_number', v_order_number
  );
end;
$$;

revoke all on function public.claim_guest_order_for_customer(text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.claim_guest_order_for_customer(text,uuid,text)
  to service_role;
