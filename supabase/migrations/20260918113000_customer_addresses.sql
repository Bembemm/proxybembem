create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  cep text not null check (cep ~ '^\d{8}$'),
  street text not null check (char_length(btrim(street)) between 2 and 120),
  number text not null check (char_length(btrim(number)) between 1 and 20),
  complement text not null default '' check (char_length(btrim(complement)) <= 80),
  neighborhood text not null check (char_length(btrim(neighborhood)) between 2 and 80),
  city text not null check (char_length(btrim(city)) between 2 and 80),
  state text not null check (state ~ '^[A-Z]{2}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_addresses_customer_created_idx
  on public.customer_addresses (customer_id, created_at desc);

create unique index if not exists customer_addresses_one_default_idx
  on public.customer_addresses (customer_id)
  where is_default;

create or replace function public.set_customer_addresses_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists set_customer_addresses_updated_at on public.customer_addresses;
create trigger set_customer_addresses_updated_at
before update on public.customer_addresses
for each row
execute function public.set_customer_addresses_updated_at();

create or replace function public.enforce_customer_address_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  if new.customer_id is null then
    raise exception 'customer address owner required';
  end if;

  -- Serialize inserts for the same customer so concurrent requests cannot
  -- both observe the same count and exceed the five-address limit.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.customer_id::text, 0)
  );

  select count(*)
    into v_count
    from public.customer_addresses
   where customer_id = new.customer_id;

  if v_count >= 5 then
    raise exception 'customer address limit reached' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_customer_address_limit on public.customer_addresses;
create trigger enforce_customer_address_limit
before insert on public.customer_addresses
for each row
execute function public.enforce_customer_address_limit();

create or replace function public.normalize_customer_address_default()
returns trigger
language plpgsql
set search_path = ''
as $
begin
  if tg_op = 'INSERT'
     and not exists (
       select 1
         from public.customer_addresses
        where customer_id = new.customer_id
     ) then
    new.is_default := true;
  end if;

  if new.is_default then
    update public.customer_addresses
       set is_default = false
     where customer_id = new.customer_id
       and id is distinct from new.id
       and is_default;
  end if;

  return new;
end;
$;

drop trigger if exists normalize_customer_address_default on public.customer_addresses;
create trigger normalize_customer_address_default
before insert or update of is_default on public.customer_addresses
for each row
execute function public.normalize_customer_address_default();

alter table public.customer_addresses enable row level security;

revoke all on table public.customer_addresses from public, anon, authenticated;
grant select, insert, update, delete on table public.customer_addresses to authenticated;

drop policy if exists customer_addresses_select_own on public.customer_addresses;
create policy customer_addresses_select_own
on public.customer_addresses
for select
to authenticated
using ((select auth.uid()) = customer_id);

drop policy if exists customer_addresses_insert_own on public.customer_addresses;
create policy customer_addresses_insert_own
on public.customer_addresses
for insert
to authenticated
with check ((select auth.uid()) = customer_id);

drop policy if exists customer_addresses_update_own on public.customer_addresses;
create policy customer_addresses_update_own
on public.customer_addresses
for update
to authenticated
using ((select auth.uid()) = customer_id)
with check ((select auth.uid()) = customer_id);

drop policy if exists customer_addresses_delete_own on public.customer_addresses;
create policy customer_addresses_delete_own
on public.customer_addresses
for delete
to authenticated
using ((select auth.uid()) = customer_id);
