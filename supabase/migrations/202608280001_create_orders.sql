create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  public_token text not null unique,
  customer_name text not null,
  whatsapp text not null,
  cep text not null,
  items jsonb not null,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  payment_provider text not null default 'mercadopago',
  preference_id text,
  payment_id text,
  payment_status text not null default 'pending',
  payment_status_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_payment_id_idx on public.orders (payment_id);
create index if not exists orders_payment_status_idx on public.orders (payment_status);
create index if not exists orders_created_at_idx on public.orders (created_at desc);

create or replace function public.set_orders_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.set_orders_updated_at();

alter table public.orders enable row level security;

revoke all on table public.orders from anon, authenticated;
grant all on table public.orders to service_role;
