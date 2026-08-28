alter table public.orders
  add column if not exists checkout_attempt_id uuid,
  add column if not exists checkout_fingerprint text,
  add column if not exists checkout_url text,
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists address_neighborhood text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists shipping_provider text,
  add column if not exists shipping_service_id text,
  add column if not exists shipping_service_name text,
  add column if not exists shipping_carrier_name text,
  add column if not exists shipping_delivery_days integer,
  add column if not exists shipping_cents integer,
  add column if not exists total_cents integer,
  add column if not exists shipping_snapshot jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_shipping_cents_nonnegative'
  ) then
    alter table public.orders
      add constraint orders_shipping_cents_nonnegative
      check (shipping_cents is null or shipping_cents >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_total_cents_positive'
  ) then
    alter table public.orders
      add constraint orders_total_cents_positive
      check (total_cents is null or total_cents > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_address_state_format'
  ) then
    alter table public.orders
      add constraint orders_address_state_format
      check (address_state is null or address_state ~ '^[A-Z]{2}$');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_shipping_delivery_days_nonnegative'
  ) then
    alter table public.orders
      add constraint orders_shipping_delivery_days_nonnegative
      check (shipping_delivery_days is null or shipping_delivery_days >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_total_matches_components'
  ) then
    alter table public.orders
      add constraint orders_total_matches_components
      check (
        total_cents is null
        or shipping_cents is null
        or total_cents = subtotal_cents + shipping_cents
      );
  end if;
end;
$$;

create unique index if not exists orders_checkout_attempt_id_uidx
  on public.orders (checkout_attempt_id)
  where checkout_attempt_id is not null;

create unique index if not exists orders_preference_id_uidx
  on public.orders (preference_id)
  where preference_id is not null;

create table if not exists public.api_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated;
grant all on table public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_request_count integer;
begin
  if p_bucket_key is null or length(p_bucket_key) < 1 or length(p_bucket_key) > 128 then
    raise exception 'invalid rate-limit bucket';
  end if;
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate-limit configuration';
  end if;

  insert into public.api_rate_limits (bucket_key, window_started_at, request_count)
  values (p_bucket_key, v_now, 1)
  on conflict (bucket_key) do nothing;

  if found then
    return true;
  end if;

  select window_started_at, request_count
  into v_window_started_at, v_request_count
  from public.api_rate_limits
  where bucket_key = p_bucket_key
  for update;

  if v_window_started_at <= v_now - (p_window_seconds * interval '1 second') then
    update public.api_rate_limits
    set window_started_at = v_now,
        request_count = 1
    where bucket_key = p_bucket_key;
    return true;
  end if;

  if v_request_count >= p_limit then
    return false;
  end if;

  update public.api_rate_limits
  set request_count = request_count + 1
  where bucket_key = p_bucket_key;

  return true;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer)
  to service_role;
