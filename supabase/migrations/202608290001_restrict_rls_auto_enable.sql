-- Keep the existing ensure_rls event trigger behavior while preventing
-- direct execution of its SECURITY DEFINER function by API-facing roles.

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
