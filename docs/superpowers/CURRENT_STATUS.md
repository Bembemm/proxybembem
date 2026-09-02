# ProxyBembem — Current Status

**Updated:** 2026-09-02

Canonical continuation checkpoint. Read this file, `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Branch: `feat/admin-dashboard-expansion`
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`
- Design: `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`
- Active plan: `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`
- State: **PHASE 1 APPLIED/VERIFIED; PHASE 2 TASKS 1–12 CODE/TDD/SECURITY/DB VALIDATION COMPLETE; TASK 13 PREVIEW ACCEPTANCE NEXT**
- Merge/new Production application deployment: **NOT APPROVED**

## Phase 1 verified baseline

Phase 1 database foundation is applied to the existing Supabase project `ProxyBembem` (`kicgoocozxzkuoqajqif`) after explicit owner authorization.

Verified:

- 25 existing orders backfilled correctly at the Phase 1 validation point;
- no fabricated historical events;
- `order_events`, `order_attention_flags`, `admin_audit_log` isolated from browser roles;
- audit/events append-only for service-role usage;
- payment approval/replay/refund/chargeback/manual-review tested transactionally;
- zero persistent validation fixtures;
- Production `/admin` remained healthy after the additive migration.

Owner workflow decision: evolve the existing Supabase project as schema is needed. No paid Supabase development branch is required. Meaningful DDL still requires explicit owner approval before application.

## Vercel Preview baseline

The earlier new-branch Preview `/admin` 500 was diagnosed as environment-scope mismatch. Owner aligned Preview env configuration and a fresh Preview returned `/admin` 200 with the Supabase origin present in CSP.

A temporary branch-specific `ignoreCommand` was later identified during Phase 2 scope review as hosting configuration outside this feature's allowed runtime scope. It was removed in commit `4b1d0e9627f1f67897a96290cac0c576682d5064`, restoring `vercel.json` to its original cron-only content. Preview env configuration remains in Vercel and is independent of this revert.

Do not assume future Preview failures are caused by missing Supabase env without checking the actual deployment/configuration again.

## Phase 2 verified runtime candidate

File:

`supabase/migrations/202609020002_admin_order_fulfillment_operations.sql`

Final reviewed runtime candidate:

`abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7`

CI `33650730746`, job `100316764581`:

- `pnpm test`: PASS;
- `pnpm typecheck`: PASS;
- `pnpm build`: PASS.

The migration/runtime candidate provides:

- backend-only `admin_list_orders(...) -> jsonb` with bounded static filtering/pagination and `America/Sao_Paulo` date boundaries;
- backend-only locked `admin_transition_order_fulfillment(...) -> jsonb`;
- atomic fulfillment transition + event + append-only admin audit + paid-cancellation attention;
- narrow reversal observer resolving only `canceled_paid_order` after actual `refunded`/`charged_back` payment state;
- service-role-only execution; no browser payment mutation;
- precise paid-cancellation idempotency using `(order_id, code) WHERE resolved_at IS NULL` rather than generic conflict swallowing.

## Phase 2 Tasks 3–10 implementation evidence

- Task 3 backend read repository: `f8ded33f97fb89ef4343caa77ee3457efbf3b79a`, CI `33634645304` PASS.
- Task 4 fulfillment repository: `f27143474c531cf8da49f49c28be42e73a7d8921`, CI `33634997803` PASS.
- Task 5 five narrow same-origin/AAL2 POST actions: `15fa3e176cc358e797e85b7bff7abdd73e66e580`, CI `33635899966` PASS.
- Task 6 protected shared admin shell: `58b2fd70a719527a29752e61e2615cf129d77cb9`, CI `33636760106` PASS.
- Task 7 `/admin/pedidos`: `f1aa1fc4e0d11d5e9b058b0544fc5656f15fa4e6`, CI `33645894040` PASS.
- Task 8 `/admin/pedidos/[id]`: `1dd2446bdd891ddb3de278d753ff5b947c1a227a`, CI `33646901907` PASS.
- Task 9 destructive cancellation confirmation: `d9c1a49be7418ce0bcdb99d4a77ca09502ee0f99`, CI `33647900422` PASS.
- Task 10 `/admin/producao`: `40019e592bde1b13d65ba8e1ff16b23504a5827f`, CI `33650042499` PASS.

Task 10 page is protected/server-side and loads exactly three oldest-first queues with fixed filters and page size 50: `Aguardando produção`, `Em produção`, `Pronto para envio`. Queue cards expose only operational summary fields and detail links.

## Task 11 — final candidate review

Phase 2 scope baseline: parent of Task 1 RED, `5662704188d7d8555dba148fbb6d8593a74e2c84`.

Review verified:

- no browser payment mutation;
- no browser-supplied admin UUID;
- no browser arbitrary fulfillment target;
- mutation routes enforce same-origin before admin/storage work and require active AAL2 admin authorization;
- dynamic route params awaited/UUID-validated;
- list/detail DTOs exclude public token, checkout fingerprint/attempt/URL and shipping snapshot;
- fulfillment RPC locks the order row with `FOR UPDATE`;
- fulfillment update, event, audit and paid-cancel attention are one DB transaction;
- cancellation never changes Mercado Pago payment state;
- actual refund/chargeback resolves only cancellation-specific attention;
- audit/event append-only privileges remain.

Scope review removed the temporary Vercel `ignoreCommand` from the candidate in `4b1d0e9627f1f67897a96290cac0c576682d5064`.

Review also found generic paid-cancel `ON CONFLICT DO NOTHING`. TDD hardening evidence:

- RED `a040701a0327c37ee3d9f732c78c8b6a55cb71a7`, CI `33650490056`: 291 tests, 290 PASS, exactly one expected failure;
- GREEN `abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7`, CI `33650730746`: test/typecheck/build PASS.

## Task 12 — Phase 2 Supabase application and validation

Owner explicitly approved application of the exact reviewed Phase 2 migration to the existing Supabase project.

Applied migration:

`20260902160658_admin_order_fulfillment_operations`

Project:

`ProxyBembem` (`kicgoocozxzkuoqajqif`)

### Structural validation — PASS

Verified after application:

- `admin_list_orders`, `admin_transition_order_fulfillment`, and `resolve_canceled_paid_order_attention` exist as `SECURITY DEFINER` functions with empty/fixed `search_path`;
- `service_role` can execute the admin list/transition RPCs;
- `anon` and `authenticated` cannot execute them;
- `resolve_canceled_paid_order_attention_after_reversal` trigger exists and is enabled on `orders`;
- `service_role` keeps SELECT/INSERT but no UPDATE/DELETE on `order_events`;
- `service_role` keeps SELECT/INSERT but no UPDATE/DELETE on `admin_audit_log`.

### Controlled rollback validation — 16/16 PASS

A temporary validation function used a PL/pgSQL exception subtransaction so every synthetic order/event/attention/audit mutation was rolled back before the call returned.

Verified:

1. list RPC returned exactly the synthetic validation set;
2. `%` in search was treated literally;
3. `awaiting_payment -> canceled` succeeded;
4. `awaiting_payment -> in_production` rejected;
5. production start without approved payment returned `payment_precondition_failed`;
6. approved `awaiting_production -> in_production` succeeded;
7. same-target retry returned `unchanged` with no duplicate event/audit;
8. `in_production -> ready_to_ship` succeeded;
9. `ready_to_ship -> shipped` succeeded;
10. `shipped -> completed` succeeded;
11. completed order rejected further transition;
12. paid cancellation kept payment `approved` and opened critical `canceled_paid_order`;
13. real refund through `apply_mercadopago_payment_event` resolved only `canceled_paid_order`, kept fulfillment canceled and retained open `payment_refunded` attention;
14. real chargeback did the analogous behavior with `payment_charged_back`;
15. validation-only direct changes to `pending` and `checkout_error` did not resolve `canceled_paid_order`;
16. nonexistent order returned `not_found`.

Post-validation persistent fixture counts:

```text
orders: 0
events: 0
attention: 0
audit: 0
```

### Supabase advisors after DDL

Security advisor produced only existing/intentional backend-isolation notices plus one Auth hardening warning:

- `rls_enabled_no_policy` INFO on backend-only tables including `orders`, `order_events`, `order_attention_flags`, `admin_audit_log`, `admin_sessions`, rate-limit and Melhor Envio OAuth tables. This is intentional in the current server/service-role architecture; no browser policy was added merely to silence the advisor.
- `auth_leaked_password_protection` WARN: leaked-password protection is disabled. This is an account/Auth hardening item, not introduced by the Phase 2 DDL.

Performance advisor:

- `unused_index` INFO for `admin_audit_admin_created_idx`; expected for a fresh/low-traffic audit index and not a reason to remove it during Phase 2.

## Phase 2 target flow

```text
awaiting_payment -> canceled
awaiting_production -> in_production | canceled
in_production -> ready_to_ship | canceled
ready_to_ship -> shipped | canceled
shipped -> completed
completed -> none
canceled -> none
```

Starting production requires `payment_status = 'approved'`. Mercado Pago remains authoritative for financial state.

## Safety gates

- Phase 2 DDL is applied and validated.
- Do not merge the feature branch without explicit owner approval.
- Do not promote/create a new Production application deployment without explicit owner approval.
- Task 13 is Preview-only acceptance of the already-reviewed branch against the now-compatible database.

## Resume point

**Last verified runtime/test commit:** `abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7`, CI `33650730746`, test/typecheck/build PASS.

**Applied Phase 2 database migration:** `20260902160658_admin_order_fulfillment_operations` — structural validation PASS, controlled rollback matrix 16/16 PASS, zero fixtures.

**Current task:** Phase 2 Task 13 — Preview acceptance.

**NEXT EXACT ACTION:** inspect the latest `feat/admin-dashboard-expansion` Preview deployment and Preview environment contract without printing secret values. Use a READY deployment that contains the Phase 2 runtime candidate or a descendant containing only checkpoint docs, then smoke `/`, protected `/admin`, `/admin/pedidos`, one safe existing order detail, `/admin/producao`, and existing Melhor Envio admin integration without performing real payments, label purchases, destructive order transitions, merge, or Production promotion. Review Preview error/fatal logs and record exact evidence.
