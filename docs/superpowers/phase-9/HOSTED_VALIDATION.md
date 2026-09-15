# Phase 9 — Hosted Supabase Validation

**Date:** 2026-09-15  
**Project:** `ProxyBembem` (`sa-east-1`)  
**Branch:** `feat/phase-9-hardening-final-rollout`

## Applied migration

Hosted migration history was read before any write. The Phase 8 migration `20260915092352 dashboard_metrics_attention_center` was already present and was not reapplied.

Only the Phase 9 migration from `supabase/migrations/202609150002_phase9_customer_profiles_rls_performance.sql` was applied. Supabase assigned:

- version: `20260915145834`
- name: `phase9_customer_profiles_rls_performance`

No Phase 7 or Phase 8 migration was reapplied.

## `customer_profiles` RLS reconciliation

Hosted inspection after the migration confirmed:

- RLS remains enabled on `public.customer_profiles`;
- `customer_profiles_select_own` is still scoped to `authenticated` and now uses `(select auth.uid()) = id`;
- `customer_profiles_insert_own` is still scoped to `authenticated` and now uses `(select auth.uid()) = id` in `WITH CHECK`;
- `customer_profiles_update_own` is still scoped to `authenticated` and now uses the same owner expression in both `USING` and `WITH CHECK`;
- authenticated table privileges remain `SELECT`, `INSERT`, and `UPDATE`; the migration did not broaden browser authority.

The correction is performance-only; ownership semantics are unchanged.

## Advisor result after Phase 9 DDL

### Performance

The three former `auth_rls_initplan` warnings on `customer_profiles` are gone. The performance advisor now reports only the six pre-existing `unused_index` INFO findings:

- `admin_audit_admin_created_idx`
- `shipments_tracking_active_idx`
- `notification_outbox_due_idx`
- `shipment_events_order_created_idx`
- `shipments_sender_profile_id_idx`
- `notification_webhook_events_provider_message_idx`

Task 4 reviewed DDL, constraint/FK relationships, repository/RPC query shapes, overlapping indexes and hosted usage evidence. No index has sufficient proof for safe removal, so no index DDL was applied.

### Security

The security advisor remains at the established baseline:

- 16 `rls_enabled_no_policy` INFO findings on intentionally private/backend tables;
- 2 `authenticated_security_definer_function_executable` WARN findings for `customer_list_orders` and `customer_get_order`, intentionally callable by authenticated users and owner-scoped through `auth.uid()`;
- 1 `auth_leaked_password_protection` WARN because leaked-password protection is disabled.

No new Phase 9-specific security finding was introduced.

## Privileged RPC verification

Hosted function inspection confirmed:

- `admin_get_dashboard_snapshot()` is `SECURITY DEFINER`, has fixed empty `search_path`, denies `anon` and `authenticated`, and grants execution to `service_role`;
- `customer_list_orders(integer, integer)` is `SECURITY DEFINER`, has fixed empty `search_path`, denies `anon`, and intentionally grants execution to `authenticated`;
- `customer_get_order(uuid)` is `SECURITY DEFINER`, has fixed empty `search_path`, denies `anon`, and intentionally grants execution to `authenticated`.

The two customer RPCs are not reclassified as vulnerabilities merely because they are authenticated `SECURITY DEFINER`; their repository contract derives customer identity from `auth.uid()` and does not treat a browser-selected customer UUID as authority.

## Leaked-password protection disposition

Fresh hosted advisor evidence confirms leaked-password protection is currently disabled. Supabase documentation states that leaked-password protection is available on the Pro Plan and above and is configured in Auth settings.

The connected Supabase tooling available in this Phase 9 session exposes advisors, SQL/migrations and project metadata, but does not expose the hosted Auth configuration read/write endpoint or billing-plan capability. Therefore Phase 9 does **not** claim the setting was enabled or that the current project is eligible. The finding is retained as `PLATFORM_LIMITATION / OWNER DASHBOARD CHECK` rather than changing an authentication setting without verifiable capability and rollback evidence.

Reference: https://supabase.com/docs/guides/auth/password-security

## Final hosted disposition

- Phase 9 DDL applied exactly once: **PASS**
- RLS ownership semantics preserved: **PASS**
- three `customer_profiles` performance warnings removed: **PASS**
- privileged RPC/grant baseline preserved: **PASS**
- six unused indexes retained after evidence gate: **PASS / KEEP**
- leaked-password protection: **DISABLED; OWNER DASHBOARD CHECK / PLATFORM CAPABILITY NOT EXPOSED TO CONNECTED TOOLING**
- synthetic customer/business rows created by validation: **none**
