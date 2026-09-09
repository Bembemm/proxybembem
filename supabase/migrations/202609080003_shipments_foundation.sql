create table if not exists public.shipping_sender_profiles (
  id uuid primary key default gen_random_uuid(),
  environment text not null unique check (environment in ('sandbox', 'production')),
  person_type text not null default 'pf' check (person_type = 'pf'),
  full_name text not null check (char_length(full_name) between 2 and 120),
  cpf text not null check (cpf ~ '^\d{11}$'),
  email text not null check (char_length(email) between 3 and 254),
  phone text not null check (phone ~ '^\d{10,13}$'),
  postal_code text not null check (postal_code ~ '^\d{8}$'),
  street text not null check (char_length(street) between 1 and 120),
  number text not null check (char_length(number) between 1 and 20),
  complement text check (
    complement is null or char_length(complement) between 1 and 80
  ),
  neighborhood text not null check (char_length(neighborhood) between 1 and 80),
  city text not null check (char_length(city) between 1 and 80),
  state text not null check (state ~ '^[A-Z]{2}$'),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shipping_sender_profiles enable row level security;
revoke all on table public.shipping_sender_profiles from public, anon, authenticated;
grant select on table public.shipping_sender_profiles to service_role;

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  sender_profile_id uuid not null references public.shipping_sender_profiles(id) on delete restrict,
  sender_profile_version bigint not null check (sender_profile_version > 0),
  provider text not null default 'melhor_envio' check (provider = 'melhor_envio'),
  environment text not null check (environment in ('sandbox', 'production')),
  document_mode text not null default 'declaration_content'
    check (document_mode = 'declaration_content'),
  state text not null default 'draft' check (
    state in (
      'draft',
      'prepared',
      'in_cart',
      'purchase_pending',
      'purchased',
      'generation_pending',
      'generated',
      'posted',
      'in_transit',
      'delivered',
      'cancel_pending',
      'canceled',
      'attention_required'
    )
  ),
  stable_state_before_attention text check (
    stable_state_before_attention is null
    or stable_state_before_attention in (
      'draft',
      'prepared',
      'in_cart',
      'purchased',
      'generated',
      'posted',
      'in_transit',
      'delivered',
      'canceled'
    )
  ),
  service_id text not null check (char_length(service_id) between 1 and 64),
  service_name text not null check (char_length(service_name) between 1 and 120),
  carrier_name text not null check (char_length(carrier_name) between 1 and 120),
  customer_shipping_cents integer not null check (customer_shipping_cents >= 0),
  provider_cost_cents integer check (
    provider_cost_cents is null or provider_cost_cents >= 0
  ),
  purchased_cost_cents integer check (
    purchased_cost_cents is null or purchased_cost_cents >= 0
  ),
  currency text not null default 'BRL' check (currency = 'BRL'),
  recipient_snapshot jsonb not null
    check (jsonb_typeof(recipient_snapshot) = 'object'),
  sender_snapshot jsonb not null
    check (jsonb_typeof(sender_snapshot) = 'object'),
  package_snapshot jsonb not null
    check (jsonb_typeof(package_snapshot) = 'object'),
  declaration_items_snapshot jsonb not null
    check (
      jsonb_typeof(declaration_items_snapshot) = 'array'
      and jsonb_array_length(declaration_items_snapshot) > 0
    ),
  provider_cart_id text check (
    provider_cart_id is null or char_length(provider_cart_id) between 1 and 128
  ),
  provider_shipment_id text check (
    provider_shipment_id is null or char_length(provider_shipment_id) between 1 and 128
  ),
  provider_order_id text check (
    provider_order_id is null or char_length(provider_order_id) between 1 and 128
  ),
  tracking_code text check (
    tracking_code is null or char_length(tracking_code) between 1 and 128
  ),
  provider_status text check (
    provider_status is null or char_length(provider_status) between 1 and 128
  ),
  last_tracking_sync_at timestamptz,
  attention_reason text check (
    attention_reason is null or char_length(attention_reason) between 1 and 64
  ),
  operation_kind text check (
    operation_kind is null
    or operation_kind in ('prepare', 'purchase', 'generation', 'cancel', 'posting')
  ),
  operation_id uuid,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (operation_kind is null and operation_id is null)
    or (operation_kind is not null and operation_id is not null)
  ),
  check (
    (state = 'attention_required' and attention_reason is not null)
    or (state <> 'attention_required')
  )
);

create unique index if not exists shipments_one_active_per_order_uidx
  on public.shipments (order_id)
  where state <> 'canceled';

create index if not exists shipments_order_created_idx
  on public.shipments (order_id, created_at desc);

create index if not exists shipments_tracking_active_idx
  on public.shipments (state, last_tracking_sync_at)
  where state in ('purchased', 'generated', 'posted', 'in_transit');

alter table public.shipments enable row level security;
revoke all on table public.shipments from public, anon, authenticated;
grant select on table public.shipments to service_role;

create table if not exists public.shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{2,63}$'),
  source text not null check (source in ('system', 'admin', 'melhor_envio')),
  dedupe_key text check (
    dedupe_key is null or char_length(dedupe_key) between 1 and 160
  ),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create unique index if not exists shipment_events_dedupe_uidx
  on public.shipment_events (shipment_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists shipment_events_shipment_created_idx
  on public.shipment_events (shipment_id, created_at desc);

create index if not exists shipment_events_order_created_idx
  on public.shipment_events (order_id, created_at desc);

alter table public.shipment_events enable row level security;
revoke all on table public.shipment_events from public, anon, authenticated;
grant select on table public.shipment_events to service_role;
