create table if not exists public.melhor_envio_oauth_credentials (
  environment text primary key
    check (environment in ('sandbox', 'production')),
  access_token_envelope text not null
    check (char_length(access_token_envelope) between 1 and 8192),
  refresh_token_envelope text not null
    check (char_length(refresh_token_envelope) between 1 and 8192),
  access_token_expires_at timestamptz not null,
  token_version bigint not null default 1
    check (token_version > 0),
  status text not null default 'active'
    check (status in ('active', 'reauthorization_required')),
  refresh_lease_owner text
    check (refresh_lease_owner is null or char_length(refresh_lease_owner) between 1 and 128),
  refresh_lease_expires_at timestamptz,
  last_auth_failure_at timestamptz,
  last_auth_failure_code text
    check (last_auth_failure_code is null or char_length(last_auth_failure_code) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((refresh_lease_owner is null) = (refresh_lease_expires_at is null))
);

create table if not exists public.melhor_envio_oauth_states (
  state_hash text primary key
    check (char_length(state_hash) = 64)
    check (state_hash ~ '^[0-9a-f]{64}$'),
  environment text not null
    check (environment in ('sandbox', 'production')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.melhor_envio_oauth_credentials enable row level security;
alter table public.melhor_envio_oauth_states enable row level security;

revoke all on table public.melhor_envio_oauth_credentials from public, anon, authenticated;
revoke all on table public.melhor_envio_oauth_states from public, anon, authenticated;

grant select, insert, update, delete on table public.melhor_envio_oauth_credentials to service_role;
grant select, insert, update, delete on table public.melhor_envio_oauth_states to service_role;

create or replace function public.consume_melhor_envio_oauth_state(
  p_state_hash text,
  p_environment text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_environment not in ('sandbox', 'production')
     or p_state_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  update public.melhor_envio_oauth_states
     set consumed_at = now()
   where state_hash = p_state_hash
     and environment = p_environment
     and consumed_at is null
     and expires_at > now();

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.upsert_melhor_envio_authorized_credential(
  p_environment text,
  p_access_token_envelope text,
  p_refresh_token_envelope text,
  p_access_token_expires_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version bigint;
begin
  if p_environment not in ('sandbox', 'production')
     or p_access_token_envelope is null
     or char_length(p_access_token_envelope) not between 1 and 8192
     or p_refresh_token_envelope is null
     or char_length(p_refresh_token_envelope) not between 1 and 8192
     or p_access_token_expires_at is null
     or p_access_token_expires_at <= now() then
    raise exception 'invalid Melhor Envio authorized credential input';
  end if;

  insert into public.melhor_envio_oauth_credentials as current_credentials (
    environment,
    access_token_envelope,
    refresh_token_envelope,
    access_token_expires_at,
    token_version,
    status,
    refresh_lease_owner,
    refresh_lease_expires_at,
    last_auth_failure_at,
    last_auth_failure_code,
    created_at,
    updated_at
  ) values (
    p_environment,
    p_access_token_envelope,
    p_refresh_token_envelope,
    p_access_token_expires_at,
    1,
    'active',
    null,
    null,
    null,
    null,
    now(),
    now()
  )
  on conflict (environment) do update
     set access_token_envelope = excluded.access_token_envelope,
         refresh_token_envelope = excluded.refresh_token_envelope,
         access_token_expires_at = excluded.access_token_expires_at,
         token_version = current_credentials.token_version + 1,
         status = 'active',
         refresh_lease_owner = null,
         refresh_lease_expires_at = null,
         last_auth_failure_at = null,
         last_auth_failure_code = null,
         updated_at = now()
  returning token_version into v_version;

  return v_version;
end;
$$;

create or replace function public.claim_melhor_envio_refresh_lease(
  p_environment text,
  p_expected_version bigint,
  p_lease_owner text,
  p_lease_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_environment not in ('sandbox', 'production')
     or p_expected_version <= 0
     or p_lease_owner is null
     or char_length(p_lease_owner) not between 1 and 128
     or p_lease_seconds not between 1 and 120 then
    return false;
  end if;

  update public.melhor_envio_oauth_credentials
     set refresh_lease_owner = p_lease_owner,
         refresh_lease_expires_at = now() + (p_lease_seconds * interval '1 second'),
         updated_at = now()
   where environment = p_environment
     and token_version = p_expected_version
     and status = 'active'
     and (
       refresh_lease_owner is null
       or refresh_lease_expires_at <= now()
     );

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.commit_melhor_envio_refresh(
  p_environment text,
  p_expected_version bigint,
  p_lease_owner text,
  p_access_token_envelope text,
  p_refresh_token_envelope text,
  p_access_token_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_environment not in ('sandbox', 'production')
     or p_expected_version <= 0
     or p_lease_owner is null
     or char_length(p_lease_owner) not between 1 and 128
     or p_access_token_envelope is null
     or char_length(p_access_token_envelope) not between 1 and 8192
     or p_refresh_token_envelope is null
     or char_length(p_refresh_token_envelope) not between 1 and 8192
     or p_access_token_expires_at is null
     or p_access_token_expires_at <= now() then
    return false;
  end if;

  update public.melhor_envio_oauth_credentials
     set access_token_envelope = p_access_token_envelope,
         refresh_token_envelope = p_refresh_token_envelope,
         access_token_expires_at = p_access_token_expires_at,
         token_version = token_version + 1,
         status = 'active',
         refresh_lease_owner = null,
         refresh_lease_expires_at = null,
         last_auth_failure_at = null,
         last_auth_failure_code = null,
         updated_at = now()
   where environment = p_environment
     and token_version = p_expected_version
     and refresh_lease_owner = p_lease_owner
     and refresh_lease_expires_at > now()
     and status = 'active';

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.release_melhor_envio_refresh_lease(
  p_environment text,
  p_expected_version bigint,
  p_lease_owner text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_environment not in ('sandbox', 'production')
     or p_expected_version <= 0
     or p_lease_owner is null
     or char_length(p_lease_owner) not between 1 and 128 then
    return false;
  end if;

  update public.melhor_envio_oauth_credentials
     set refresh_lease_owner = null,
         refresh_lease_expires_at = null,
         updated_at = now()
   where environment = p_environment
     and token_version = p_expected_version
     and refresh_lease_owner = p_lease_owner;

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.mark_melhor_envio_reauthorization_required(
  p_environment text,
  p_expected_version bigint,
  p_lease_owner text,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_environment not in ('sandbox', 'production')
     or p_expected_version <= 0
     or p_lease_owner is null
     or char_length(p_lease_owner) not between 1 and 128
     or p_failure_code is null
     or p_failure_code !~ '^[a-z0-9_]{1,64}$' then
    return false;
  end if;

  update public.melhor_envio_oauth_credentials
     set status = 'reauthorization_required',
         refresh_lease_owner = null,
         refresh_lease_expires_at = null,
         last_auth_failure_at = now(),
         last_auth_failure_code = p_failure_code,
         updated_at = now()
   where environment = p_environment
     and token_version = p_expected_version
     and refresh_lease_owner = p_lease_owner
     and refresh_lease_expires_at > now()
     and status = 'active';

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.consume_melhor_envio_oauth_state(text,text) from public, anon, authenticated;
grant execute on function public.consume_melhor_envio_oauth_state(text,text) to service_role;

revoke all on function public.upsert_melhor_envio_authorized_credential(text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_melhor_envio_authorized_credential(text,text,text,timestamptz) to service_role;

revoke all on function public.claim_melhor_envio_refresh_lease(text,bigint,text,integer) from public, anon, authenticated;
grant execute on function public.claim_melhor_envio_refresh_lease(text,bigint,text,integer) to service_role;

revoke all on function public.commit_melhor_envio_refresh(text,bigint,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.commit_melhor_envio_refresh(text,bigint,text,text,text,timestamptz) to service_role;

revoke all on function public.release_melhor_envio_refresh_lease(text,bigint,text) from public, anon, authenticated;
grant execute on function public.release_melhor_envio_refresh_lease(text,bigint,text) to service_role;

revoke all on function public.mark_melhor_envio_reauthorization_required(text,bigint,text,text) from public, anon, authenticated;
grant execute on function public.mark_melhor_envio_reauthorization_required(text,bigint,text,text) to service_role;
