create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  auth_session_id uuid not null unique,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists admin_sessions_one_active_per_user
  on public.admin_sessions(user_id)
  where revoked_at is null;

alter table public.admin_sessions enable row level security;

revoke all on table public.admin_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_sessions to service_role;

create or replace function public.activate_admin_session(
  p_auth_session_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_id uuid;
  v_existing_last_activity timestamptz;
  v_existing_revoked_at timestamptz;
  v_new_id uuid;
begin
  if p_auth_session_id is null or p_user_id is null then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  select id, last_activity_at, revoked_at
    into v_existing_id, v_existing_last_activity, v_existing_revoked_at
    from public.admin_sessions
   where auth_session_id = p_auth_session_id
     and user_id = p_user_id
   for update;

  if found then
    if v_existing_revoked_at is null
       and v_existing_last_activity > now() - interval '30 minutes' then
      return v_existing_id;
    end if;

    if v_existing_revoked_at is null then
      update public.admin_sessions
         set revoked_at = now()
       where id = v_existing_id
         and revoked_at is null;
    end if;

    return null;
  end if;

  update public.admin_sessions
     set revoked_at = now()
   where user_id = p_user_id
     and revoked_at is null;

  insert into public.admin_sessions(auth_session_id, user_id)
  values (p_auth_session_id, p_user_id)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

create or replace function public.authorize_admin_session(
  p_auth_session_id uuid,
  p_user_id uuid,
  p_touch boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_last_activity timestamptz;
  v_revoked_at timestamptz;
begin
  if p_auth_session_id is null or p_user_id is null then
    return 'missing';
  end if;

  select id, last_activity_at, revoked_at
    into v_id, v_last_activity, v_revoked_at
    from public.admin_sessions
   where auth_session_id = p_auth_session_id
     and user_id = p_user_id
   for update;

  if not found then
    return 'missing';
  end if;

  if v_revoked_at is not null then
    return 'revoked';
  end if;

  if v_last_activity <= now() - interval '30 minutes' then
    update public.admin_sessions
       set revoked_at = now()
     where id = v_id
       and revoked_at is null;
    return 'expired';
  end if;

  if p_touch then
    update public.admin_sessions
       set last_activity_at = now()
     where id = v_id
       and revoked_at is null;
  end if;

  return 'active';
end;
$$;

create or replace function public.revoke_admin_session(
  p_auth_session_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.admin_sessions
     set revoked_at = now()
   where auth_session_id = p_auth_session_id
     and user_id = p_user_id
     and revoked_at is null;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.activate_admin_session(uuid,uuid) from public, anon, authenticated;
revoke all on function public.authorize_admin_session(uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.revoke_admin_session(uuid,uuid) from public, anon, authenticated;

grant execute on function public.activate_admin_session(uuid,uuid) to service_role;
grant execute on function public.authorize_admin_session(uuid,uuid,boolean) to service_role;
grant execute on function public.revoke_admin_session(uuid,uuid) to service_role;
