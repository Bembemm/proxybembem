# Phase 9 — Supabase hardening audit

**Date:** 2026-09-15  
**Project:** `proxybembem` (`kicgoocozxzkuoqajqif`)  
**Branch:** `feat/phase-9-hardening-final-rollout`

This checkpoint records the repository review plus fresh hosted advisor/index evidence gathered before the Phase 9 migration is applied. It is not the hosted acceptance document. The additive `customer_profiles` RLS optimization exists in the repository but remains intentionally unapplied until Task 7.

## Privileged RPC / grant review

Repository contracts confirm the following authority model:

- `customer_list_orders(integer,integer)` and `customer_get_order(uuid)` are intentionally callable by `authenticated`. Both are `SECURITY DEFINER`, use `set search_path = ''`, derive the customer identity from `auth.uid()`, and accept no caller-controlled customer UUID as authority. Their advisor warning is therefore intentional, not an exposure to remove.
- `claim_guest_order_for_customer(text,uuid,text)` remains `service_role` only. Although the function accepts a customer UUID, browser roles cannot execute it and the function independently checks the verified Supabase Auth user/email relation. The application guest-claim surface remains retired.
- admin session RPCs, `apply_mercadopago_payment_event`, `admin_update_store_settings`, and `admin_get_dashboard_snapshot` remain `SECURITY DEFINER` with fixed empty search paths and service-role-only execution.
- Phase 8 dashboard aggregation remains a server-side read RPC; browser roles are explicitly revoked.

`tests/phase9-supabase-hardening.test.ts` codifies these representative final invariants. Existing focused migration suites remain the deeper per-feature coverage.

## Fresh hosted advisor findings before Phase 9 DDL

| Finding | Object | Severity | Disposition | Evidence/reason |
| --- | --- | --- | --- | --- |
| `rls_enabled_no_policy` | `public.admin_audit_log` | INFO | KEEP_INTENTIONAL | Private operational/audit table; browser roles are not intended to query it directly. Final hosted grants are rechecked in Task 7. |
| `rls_enabled_no_policy` | `public.admin_sessions` | INFO | KEEP_INTENTIONAL | Server-only admin session authority; no browser policy is intentional. |
| `rls_enabled_no_policy` | `public.api_rate_limits` | INFO | KEEP_INTENTIONAL | Server-side abuse-control state; browser access is intentionally absent. |
| `rls_enabled_no_policy` | `public.melhor_envio_oauth_credentials` | INFO | KEEP_INTENTIONAL | Provider credentials are server-only. |
| `rls_enabled_no_policy` | `public.melhor_envio_oauth_states` | INFO | KEEP_INTENTIONAL | OAuth operational state is server-only. |
| `rls_enabled_no_policy` | `public.notification_outbox` | INFO | KEEP_INTENTIONAL | Durable worker queue is server/service-role state. |
| `rls_enabled_no_policy` | `public.notification_webhook_events` | INFO | KEEP_INTENTIONAL | Provider webhook reconciliation state is server-side. |
| `rls_enabled_no_policy` | `public.order_attention_flags` | INFO | KEEP_INTENTIONAL | Private operational/admin signal; no direct browser table access is intended. |
| `rls_enabled_no_policy` | `public.order_events` | INFO | KEEP_INTENTIONAL | Authoritative operational history is exposed only through controlled server/RPC projections. |
| `rls_enabled_no_policy` | `public.orders` | INFO | KEEP_INTENTIONAL | Private orders are not exposed as a browser-readable base table; customer reads use owner-scoped RPCs. |
| `rls_enabled_no_policy` | `public.password_recovery_grants` | INFO | KEEP_INTENTIONAL | Sensitive recovery lease/grant state is server-only. |
| `rls_enabled_no_policy` | `public.products` | INFO | KEEP_INTENTIONAL | Product writes and authoritative reads use controlled server paths; no direct browser table policy is required by the current architecture. |
| `rls_enabled_no_policy` | `public.shipment_events` | INFO | KEEP_INTENTIONAL | Shipping operational history is server-projected. |
| `rls_enabled_no_policy` | `public.shipments` | INFO | KEEP_INTENTIONAL | Shipment provider/operation state is server-only. |
| `rls_enabled_no_policy` | `public.shipping_sender_profiles` | INFO | KEEP_INTENTIONAL | Sender identity/configuration is private shipping state. |
| `rls_enabled_no_policy` | `public.store_settings` | INFO | KEEP_INTENTIONAL | Base table is private; public settings are projected through sanitized server code. |
| `authenticated_security_definer_function_executable` | `public.customer_get_order(uuid)` | WARN | KEEP_INTENTIONAL | Intentional private customer RPC; identity is `auth.uid()` and order lookup requires `o.customer_id = auth.uid()`. No caller customer UUID is accepted. |
| `authenticated_security_definer_function_executable` | `public.customer_list_orders(integer,integer)` | WARN | KEEP_INTENTIONAL | Intentional private customer RPC; identity is `auth.uid()` and pagination inputs do not choose ownership. |
| `auth_leaked_password_protection` | Supabase Auth | WARN | FIX | Protection is currently disabled. Task 7 will enable it only if the hosted project supports it safely; otherwise this row will be reclassified `PLATFORM_LIMITATION` with exact evidence. |
| `auth_rls_initplan` | `customer_profiles_select_own` | WARN | FIX | Repository migration `202609150002_phase9_customer_profiles_rls_performance.sql` changes only evaluation to `(select auth.uid()) = id`; hosted application is pending Task 7. |
| `auth_rls_initplan` | `customer_profiles_insert_own` | WARN | FIX | Same semantic-preserving Phase 9 migration; hosted application pending. |
| `auth_rls_initplan` | `customer_profiles_update_own` | WARN | FIX | Same semantic-preserving Phase 9 migration; hosted application pending. |
| `unused_index` | `admin_audit_admin_created_idx` | INFO | KEEP_UNPROVEN | 16 KiB, `idx_scan=0`, not unique/constraint-backed, and not subsumed by the entity audit index. Current traffic does not prove value, but there is also no evidence proving safe redundancy; keep rather than delete speculatively. |
| `unused_index` | `shipments_tracking_active_idx` | INFO | KEEP_INTENTIONAL | 8 KiB partial index over active tracking states; repository tracking batches filter the same active states. No equivalent index subsumes it. |
| `unused_index` | `notification_outbox_due_idx` | INFO | KEEP_INTENTIONAL | 16 KiB partial queue index on `next_attempt_at, created_at` for `pending/retry_scheduled`; directly matches due-outbox claiming semantics. |
| `unused_index` | `shipment_events_order_created_idx` | INFO | KEEP_INTENTIONAL | 16 KiB index on `order_id, created_at desc`; supports order-scoped shipment history and is not subsumed by the shipment-scoped event index. |
| `unused_index` | `shipments_sender_profile_id_idx` | INFO | KEEP_INTENTIONAL | 16 KiB referencing-side index for `shipments.sender_profile_id`; useful for FK parent update/delete checks and not replaced by the order indexes. |
| `unused_index` | `notification_webhook_events_provider_message_idx` | INFO | KEEP_INTENTIONAL | 16 KiB index on `provider_message_id, received_at desc`; supports provider-message reconciliation/late webhook lookup and is distinct from the notification-id/Svix indexes. |

Fresh advisor references:
- RLS no-policy: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Authenticated `SECURITY DEFINER`: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Leaked-password protection: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- RLS initplan: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
- Unused indexes: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Index decision

No Phase 9 index-removal migration is justified by current evidence.

All six advisor entries currently report `idx_scan=0`, but the database is low-traffic and each index is only 8–16 KiB. Five have a concrete operational/FK role and no equivalent index fully subsumes them. `admin_audit_admin_created_idx` has no observed scan yet, but it is also non-subsumed and cheap; absence of scans is insufficient proof that deleting it is safe. It is therefore retained as `KEEP_UNPROVEN`, not mislabeled as necessary.

This follows the owner-approved rule: remove automatically only after project/query/constraint analysis proves the index redundant. That proof does not exist for any of the six current findings.

## State entering hosted Task 7

- Repository RLS correction: implemented and CI-covered; **not yet applied to hosted Supabase**.
- Current hosted performance advisor: expected three `customer_profiles` initplan warnings plus six informational unused-index findings.
- Current hosted security advisor: 16 intentional private-table RLS/no-policy INFO findings, two intentional owner-scoped customer RPC WARN findings, and leaked-password protection disabled.
- No new security/grant defect was demonstrated by the Task 4 repository review.
- Final hosted grant/RLS/advisor reconciliation remains a Task 7 gate and must use post-migration evidence.
