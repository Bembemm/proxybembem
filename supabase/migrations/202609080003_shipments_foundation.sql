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

create or replace function public.admin_upsert_shipping_sender_profile(
  p_environment text,
  p_admin_user_id uuid,
  p_expected_version bigint,
  p_full_name text,
  p_cpf text,
  p_email text,
  p_phone text,
  p_postal_code text,
  p_street text,
  p_number text,
  p_complement text,
  p_neighborhood text,
  p_city text,
  p_state text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.shipping_sender_profiles%rowtype;
  v_profile public.shipping_sender_profiles%rowtype;
  v_outcome text;
  v_cpf_changed boolean := false;
begin
  if p_environment not in ('sandbox', 'production')
    or p_admin_user_id is null
    or char_length(p_full_name) not between 2 and 120
    or p_cpf !~ '^\d{11}$'
    or char_length(p_email) not between 3 and 254
    or p_phone !~ '^\d{10,13}$'
    or p_postal_code !~ '^\d{8}$'
    or char_length(p_street) not between 1 and 120
    or char_length(p_number) not between 1 and 20
    or (p_complement is not null and char_length(p_complement) not between 1 and 80)
    or char_length(p_neighborhood) not between 1 and 80
    or char_length(p_city) not between 1 and 80
    or p_state !~ '^[A-Z]{2}$'
    or (p_expected_version is not null and p_expected_version <= 0)
  then
    raise exception 'invalid shipping sender input';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('shipping_sender_profile:' || p_environment, 0)
  );

  select *
    into v_current
    from public.shipping_sender_profiles
   where environment = p_environment
   for update;

  if not found then
    if p_expected_version is not null then
      return pg_catalog.jsonb_build_object('outcome', 'conflict');
    end if;

    insert into public.shipping_sender_profiles (
      environment,
      person_type,
      full_name,
      cpf,
      email,
      phone,
      postal_code,
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      version
    ) values (
      p_environment,
      'pf',
      p_full_name,
      p_cpf,
      p_email,
      p_phone,
      p_postal_code,
      p_street,
      p_number,
      p_complement,
      p_neighborhood,
      p_city,
      p_state,
      1
    )
    returning * into v_profile;

    v_outcome := 'created';
    v_cpf_changed := true;
  else
    if p_expected_version is null or v_current.version <> p_expected_version then
      return pg_catalog.jsonb_build_object('outcome', 'conflict');
    end if;

    v_cpf_changed := v_current.cpf <> p_cpf;

    update public.shipping_sender_profiles as s
       set full_name = p_full_name,
           cpf = p_cpf,
           email = p_email,
           phone = p_phone,
           postal_code = p_postal_code,
           street = p_street,
           number = p_number,
           complement = p_complement,
           neighborhood = p_neighborhood,
           city = p_city,
           state = p_state,
           version = s.version + 1,
           updated_at = pg_catalog.now()
     where s.id = v_current.id
    returning * into v_profile;

    v_outcome := 'updated';
  end if;

  insert into public.admin_audit_log (
    admin_user_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values,
    metadata
  ) values (
    p_admin_user_id,
    'shipping_sender_profile',
    v_profile.id::text,
    case when v_outcome = 'created' then 'sender_created' else 'sender_updated' end,
    case
      when v_outcome = 'updated'
        then pg_catalog.jsonb_build_object('version', v_current.version)
      else null
    end,
    pg_catalog.jsonb_build_object('version', v_profile.version),
    pg_catalog.jsonb_build_object(
      'environment', p_environment,
      'cpf_changed', v_cpf_changed
    )
  );

  return pg_catalog.jsonb_build_object(
    'outcome', v_outcome,
    'profile', pg_catalog.jsonb_build_object(
      'id', v_profile.id,
      'environment', v_profile.environment,
      'person_type', v_profile.person_type,
      'full_name', v_profile.full_name,
      'cpf', v_profile.cpf,
      'email', v_profile.email,
      'phone', v_profile.phone,
      'postal_code', v_profile.postal_code,
      'street', v_profile.street,
      'number', v_profile.number,
      'complement', v_profile.complement,
      'neighborhood', v_profile.neighborhood,
      'city', v_profile.city,
      'state', v_profile.state,
      'version', v_profile.version,
      'updated_at', v_profile.updated_at
    )
  );
end;
$$;

revoke all on function public.admin_upsert_shipping_sender_profile(
  text, uuid, bigint, text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.admin_upsert_shipping_sender_profile(
  text, uuid, bigint, text, text, text, text, text, text, text, text, text, text, text
) to service_role;
