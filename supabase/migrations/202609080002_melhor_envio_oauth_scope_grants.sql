create or replace function public.is_valid_melhor_envio_scope_array(
  p_scopes text[]
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_scopes is not null
    and cardinality(p_scopes) between 1 and 9
    and not exists (
      select 1
      from unnest(p_scopes) as scope(value)
      where scope.value is null
         or scope.value not in (
           'shipping-calculate',
           'cart-read',
           'cart-write',
           'orders-read',
           'shipping-checkout',
           'shipping-generate',
           'shipping-print',
           'shipping-tracking',
           'shipping-cancel'
         )
    )
    and (
      select count(*) = count(distinct scope.value)
      from unnest(p_scopes) as scope(value)
    );
$$;

revoke all on function public.is_valid_melhor_envio_scope_array(text[])
  from public, anon, authenticated;
grant execute on function public.is_valid_melhor_envio_scope_array(text[])
  to service_role;

alter table public.melhor_envio_oauth_credentials
  add column if not exists authorized_scopes text[] not null
    default array['shipping-calculate']::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'melhor_envio_oauth_credentials_authorized_scopes_valid'
      and conrelid = 'public.melhor_envio_oauth_credentials'::regclass
  ) then
    alter table public.melhor_envio_oauth_credentials
      add constraint melhor_envio_oauth_credentials_authorized_scopes_valid
      check (public.is_valid_melhor_envio_scope_array(authorized_scopes));
  end if;
end;
$$;

-- Keep the original RPC signature available for rollback compatibility, but make
-- its permission semantics explicit: callers that do not supply scope evidence
-- can only establish the historical quote-only authorization.
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
    authorized_scopes,
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
    array['shipping-calculate']::text[],
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
         authorized_scopes = array['shipping-calculate']::text[],
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

revoke all on function public.upsert_melhor_envio_authorized_credential(text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.upsert_melhor_envio_authorized_credential(text,text,text,timestamptz)
  to service_role;

create or replace function public.upsert_melhor_envio_authorized_credential_v2(
  p_environment text,
  p_access_token_envelope text,
  p_refresh_token_envelope text,
  p_access_token_expires_at timestamptz,
  p_authorized_scopes text[]
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
     or p_access_token_expires_at <= now()
     or not public.is_valid_melhor_envio_scope_array(p_authorized_scopes) then
    raise exception 'invalid Melhor Envio authorized credential input';
  end if;

  insert into public.melhor_envio_oauth_credentials as current_credentials (
    environment,
    access_token_envelope,
    refresh_token_envelope,
    access_token_expires_at,
    authorized_scopes,
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
    p_authorized_scopes,
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
         authorized_scopes = p_authorized_scopes,
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

revoke all on function public.upsert_melhor_envio_authorized_credential_v2(text,text,text,timestamptz,text[])
  from public, anon, authenticated;
grant execute on function public.upsert_melhor_envio_authorized_credential_v2(text,text,text,timestamptz,text[])
  to service_role;
