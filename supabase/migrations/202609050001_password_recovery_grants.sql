create table if not exists public.password_recovery_grants (
  grant_key text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  lease_id uuid,
  lease_expires_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  constraint password_recovery_grants_key_format
    check (grant_key ~ '^[0-9a-f]{64}$'),
  constraint password_recovery_grants_expiry_order
    check (expires_at > created_at),
  constraint password_recovery_grants_lease_pair
    check ((lease_id is null) = (lease_expires_at is null))
);

create index if not exists password_recovery_grants_user_id_idx
  on public.password_recovery_grants (user_id);

alter table public.password_recovery_grants enable row level security;
revoke all on table public.password_recovery_grants
  from public, anon, authenticated, service_role;

create or replace function public.issue_password_recovery_grant(
  p_grant_key text,
  p_user_id uuid,
  p_ttl_seconds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_grant_key is null or p_grant_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid password recovery grant key';
  end if;
  if p_user_id is null then
    raise exception 'invalid password recovery user';
  end if;
  if p_ttl_seconds < 60 or p_ttl_seconds > 3600 then
    raise exception 'invalid password recovery ttl';
  end if;

  perform 1
  from auth.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'password recovery user not found';
  end if;

  update public.password_recovery_grants
  set revoked_at = v_now,
      lease_id = null,
      lease_expires_at = null
  where user_id = p_user_id
    and consumed_at is null
    and revoked_at is null;

  insert into public.password_recovery_grants (
    grant_key,
    user_id,
    created_at,
    expires_at
  )
  values (
    p_grant_key,
    p_user_id,
    v_now,
    v_now + (p_ttl_seconds * interval '1 second')
  );

  delete from public.password_recovery_grants
  where expires_at < v_now - interval '1 day'
     or consumed_at < v_now - interval '1 day'
     or revoked_at < v_now - interval '1 day';
end;
$$;

create or replace function public.claim_password_recovery_grant(
  p_grant_key text,
  p_lease_id uuid,
  p_lease_seconds integer,
  p_retry_window_seconds integer
)
returns table(status text, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_user_id uuid;
  v_expires_at timestamptz;
  v_lease_expires_at timestamptz;
  v_consumed_at timestamptz;
  v_revoked_at timestamptz;
begin
  if p_grant_key is null or p_grant_key !~ '^[0-9a-f]{64}$' then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;
  if p_lease_id is null then
    raise exception 'invalid password recovery lease id';
  end if;
  if p_lease_seconds < 5 or p_lease_seconds > 120 then
    raise exception 'invalid password recovery lease';
  end if;
  if p_retry_window_seconds < 60 or p_retry_window_seconds > 600 then
    raise exception 'invalid password recovery retry window';
  end if;

  select g.user_id, g.expires_at, g.lease_expires_at, g.consumed_at, g.revoked_at
  into v_user_id, v_expires_at, v_lease_expires_at, v_consumed_at, v_revoked_at
  from public.password_recovery_grants as g
  where g.grant_key = p_grant_key
  for update;

  if not found
     or v_consumed_at is not null
     or v_revoked_at is not null
     or v_expires_at <= v_now then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  if v_lease_expires_at is not null and v_lease_expires_at > v_now then
    return query select 'busy'::text, null::uuid;
    return;
  end if;

  update public.password_recovery_grants
  set lease_id = p_lease_id,
      lease_expires_at = v_now + (p_lease_seconds * interval '1 second'),
      expires_at = least(
        expires_at,
        v_now + (p_retry_window_seconds * interval '1 second')
      )
  where grant_key = p_grant_key;

  return query select 'claimed'::text, v_user_id;
end;
$$;

create or replace function public.finish_password_recovery_grant(
  p_grant_key text,
  p_lease_id uuid,
  p_success boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_grant_key is null or p_grant_key !~ '^[0-9a-f]{64}$' or p_lease_id is null then
    return false;
  end if;

  if p_success then
    update public.password_recovery_grants
    set consumed_at = v_now,
        lease_id = null,
        lease_expires_at = null
    where grant_key = p_grant_key
      and lease_id = p_lease_id
      and consumed_at is null
      and revoked_at is null;
  else
    update public.password_recovery_grants
    set lease_id = null,
        lease_expires_at = null
    where grant_key = p_grant_key
      and lease_id = p_lease_id
      and consumed_at is null
      and revoked_at is null;
  end if;

  return found;
end;
$$;

revoke all on function public.issue_password_recovery_grant(text, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_password_recovery_grant(text, uuid, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.finish_password_recovery_grant(text, uuid, boolean)
  from public, anon, authenticated, service_role;

grant execute on function public.issue_password_recovery_grant(text, uuid, integer)
  to service_role;
grant execute on function public.claim_password_recovery_grant(text, uuid, integer, integer)
  to service_role;
grant execute on function public.finish_password_recovery_grant(text, uuid, boolean)
  to service_role;
