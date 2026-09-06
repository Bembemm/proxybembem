create or replace function public.check_password_recovery_grant(
  p_grant_key text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select
    p_grant_key is not null
    and p_grant_key ~ '^[0-9a-f]{64}$'
    and exists (
      select 1
      from public.password_recovery_grants as g
      where g.grant_key = p_grant_key
        and g.consumed_at is null
        and g.revoked_at is null
        and g.expires_at > clock_timestamp()
    );
$$;

revoke all on function public.check_password_recovery_grant(text)
  from public, anon, authenticated, service_role;

grant execute on function public.check_password_recovery_grant(text)
  to service_role;
