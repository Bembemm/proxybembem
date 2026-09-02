# ProxyBembem — Current Status

**Updated:** 2026-09-02

This is the canonical repository-wide continuation checkpoint. For the active admin expansion, read this file, then `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then the active phase plan.

## Active project — Admin Dashboard + Customer Account Expansion

- Branch: `feat/admin-dashboard-expansion`.
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`.
- Approved design: `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`.
- Master Plan: `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`.
- Active phase plan: `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md`.
- State: **PHASE 1 CODE + DATABASE FOUNDATION IMPLEMENTED AND VERIFIED; PREVIEW ADMIN SMOKE BLOCKED BY PREVIEW ENV CONFIGURATION**.
- Production application code/deployment is unchanged; the approved additive Phase 1 migration is now applied to the existing Supabase project.
- No merge of `feat/admin-dashboard-expansion` to `main` has been approved.

## Phase 1 verified code candidate

Implementation candidate before checkpoint/documentation commits:

`0ce3b371eda1cfccbd8ddde639b07e7b7ae57848`

Exact CI for that code candidate:

- run `33590493640`;
- job `100123329614`;
- `pnpm test`: PASS;
- `pnpm typecheck`: PASS;
- `pnpm build`: PASS.

Latest documentation checkpoint before database application:

`11eb39252cb8c00cdc64336582b53e69b5fb10a6`

CI for that HEAD also passed all three gates (`pnpm test`, `pnpm typecheck`, `pnpm build`) in run `33590734705`.

Full branch diff review from `main` base `b7172e86...` to candidate `0ce3b371...` found only the approved planning docs, one additive Phase 1 migration, fulfillment/metadata/event/attention/audit server modules, narrow `orders.ts` contract changes, and relevant tests/fixtures. No storefront, catalog authority, customer-account UI, label flow, hosting, or admin UI changes entered Phase 1.

### Implemented Phase 1 foundation

- `supabase/migrations/202609020001_admin_order_operations_foundation.sql` is versioned in Git and has now been applied to the existing `ProxyBembem` Supabase project with explicit owner authorization.
- Supabase recorded migration version `20260902091641`, name `admin_order_operations_foundation`.
- Adds compatibility-safe `orders.fulfillment_status` and conservative backfill.
- Adds `order_events`, `order_attention_flags`, and append-only `admin_audit_log` with RLS/browser-role restrictions.
- Existing Mercado Pago payment RPC keeps the same input signature and now atomically handles the one allowed automatic fulfillment transition plus payment-related events/attention.
- `lib/server/fulfillment.ts` provides stable fulfillment vocabulary/transition rules.
- `lib/server/safe-metadata.ts` recursively blocks secret/internal metadata and unsafe JSON shapes.
- `lib/server/order-events.ts` uses explicit `on_conflict=dedupe_key` only for real dedupe requests.
- `lib/server/order-attention.ts` treats only the named partial-index `23505` duplicate as idempotent; unrelated conflicts fail.
- `lib/server/admin-audit.ts` exposes append/list only, with no update/delete API.
- Branch `lib/server/orders.ts` strictly validates the new RPC result while keeping the payment RPC request body unchanged.
- Current `main` payment parser remains compatible with the RPC because it validates the existing fields and does not reject additional response fields.

### TDD/debugging evidence

- Migration RED: `bcebfdc71e28f7b54141e7f32a97f45c5782bb41`, expected missing-file failures.
- Migration GREEN: `bdf02ffd76a3c63efd0fe617bada587965af7171`, CI full PASS.
- Fulfillment state machine completed RED -> GREEN.
- Payment RPC contract RED: `dbd2496fc4416fba374da9addc058d370f0a6b5e`, expected unknown-status acceptance failure.
- Systematic debugging found two stale test fixtures after the `OrderRecord` contract expansion; only fixture data changed, not webhook production logic.
- Stabilized contract candidate `1f1ba69dd61ed9c41d4abb4489f30d325a669be9` passed full CI.
- Order events GREEN `186d34d109c4bc6a41a02c7b8b172ae8838303e4`, full CI PASS.
- Order attention RED `cadb3d30a46a1eea2d11ed9b43779a1fd9175abf`; GREEN `7ae5338b640f15f78554cb5c71ae5351643a5e3c`, full CI PASS.
- Admin audit RED `2b6af16a5362d8d7e8e75d3a5850ee9708ae1da6`; GREEN `0ce3b371eda1cfccbd8ddde639b07e7b7ae57848`, full CI PASS.

## Supabase execution model and Phase 1 validation

Connected Supabase state checked on 2026-09-02:

- one project exists: `ProxyBembem`;
- project ref: `kicgoocozxzkuoqajqif`;
- region: `sa-east-1`;
- status: healthy;
- development branches: none.

The owner explicitly clarified that this project has historically been evolved in place as features need schema changes and that no Supabase development branch has been used. Do **not** treat creation of a paid Supabase development branch as a requirement. Future DDL on the current Supabase project still requires explicit owner approval when it is a meaningful Production database change.

### Phase 1 database application evidence

Migration `admin_order_operations_foundation` was applied successfully to the current Supabase project after explicit owner approval.

Safe aggregate validation after application:

- existing orders checked: 25;
- `fulfillment_status` NULL rows: 0;
- approved orders with incorrect backfill: 0;
- non-approved orders with incorrect backfill: 0;
- `order_events`, `order_attention_flags`, `admin_audit_log`: present;
- RLS enabled on all three new tables;
- `anon` cannot read `order_events`;
- `authenticated` cannot read `order_events`;
- `service_role` can insert `order_events`;
- fulfillment default is `awaiting_payment`;
- allowed-status constraint exists;
- partial active-attention unique index exists;
- payment RPC remains `SECURITY DEFINER` with fixed/empty search path;
- `anon`/`authenticated` cannot execute the payment RPC;
- `service_role` can execute it.

Controlled real-database RPC validation was executed inside a transaction and rolled back. It proved:

- pending + exact trusted approval -> `approved` + `awaiting_production` + `fulfillment_transitioned=true`;
- repeating the same approval -> `ignored` and no duplicate operational event;
- approved -> refunded keeps `awaiting_production` and opens critical `payment_refunded` attention;
- approved -> charged_back keeps `awaiting_production` and opens critical `payment_charged_back` attention;
- amount mismatch -> `manual_review`, remains `awaiting_payment`, opens critical `payment_manual_review` attention;
- final persistent validation rows: 0.

### Supabase advisor review

Post-DDL security advisor findings:

- `RLS Enabled No Policy` appears for the new operational tables. This is intentional for these backend-only tables because browser roles are revoked and `service_role` is the allowed server access path. Remediation reference if architecture changes: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Existing `Leaked Password Protection Disabled` warning remains. It is not caused by Phase 1 and should be reconsidered during the customer-account/auth hardening phase: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Post-DDL performance advisor reports the new indexes as unused. That is expected immediately after creation; do not remove them based only on this initial lint. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Preview and Production smoke state

### Vercel Preview

Latest branch Preview for documentation HEAD `11eb3925...`:

- deployment `dpl_Eb7dUhzmbN5JMzYUn5Knav85mUau`;
- state: READY;
- `/`: HTTP 200;
- `/admin`: HTTP 500.

Root cause of Preview `/admin` failure is confirmed from runtime logs:

`Missing required public environment variable: NEXT_PUBLIC_SUPABASE_URL`

This is a Preview-environment configuration issue, not a Phase 1 database/RPC regression. The available Vercel connector cannot mutate environment variables, so **Preview admin is not approved** yet. Do not hide or misclassify this blocker.

### Current Production application after database migration

- `https://www.proxybembem.com.br/admin`: HTTP 200 and correctly renders the protected admin login surface.
- Production error/fatal runtime log query over the 30 minutes following validation returned no matching errors.
- Production application code/deployment remains the pre-expansion `main`; only the explicitly approved additive database migration changed.

## Architectural decisions future chats must not rediscover

- Modular monolith in existing Next.js + Supabase app.
- Keep `/admin`; security relies on server authorization, mandatory TOTP/AAL2, one active session, 30-minute inactivity, fail-closed behavior.
- Payment is provider-authoritative; admin cannot force paid/refunded locally.
- Fulfillment: `awaiting_payment -> awaiting_production -> in_production -> ready_to_ship -> shipped -> completed`; `canceled` exceptional/terminal where valid.
- Only trusted approved payment automatically performs `awaiting_payment -> awaiting_production`.
- Refund/chargeback creates attention without rewinding physical fulfillment.
- No generic arbitrary admin order/payment PATCH.
- Order events and admin audit are append-oriented and separate.
- Customer account optional: email + permanent password + email verification + reset; Auth UUID owns relationships.
- Guest checkout/public-token tracking remain.
- Catalog moves to Supabase in stages; checkout remains server-authoritative and historical snapshots immutable.
- Label purchase never happens automatically after payment and always requires explicit admin confirmation.
- Tracking may synchronize read-only when safe.
- Transactional email uses outbox/job isolation.
- Store settings expose no infrastructure secrets.
- Migrations compatibility-first and no historical facts are fabricated.
- `IMPLEMENTED`, `TESTED`, `PREVIEW APPROVED`, `PRODUCTION APPROVED` are distinct.
- No merge/high-risk Production action without explicit owner approval.
- Do not delete feature branches unless owner explicitly requests cleanup.
- Do not introduce a paid Supabase development branch merely because one was suggested; the owner explicitly chose the existing in-place Supabase workflow.

## Production baseline

- Repo: `Bembemm/proxybembem`.
- Canonical `main`: `b7172e86ec5bc1c4a773e99ef0886ce512649110`.
- Existing Production deployment: `dpl_DFZhbQpkxZ8CRqJsLKx2jU8v9MAX`, READY.
- Canonical domains: `https://www.proxybembem.com.br` and `https://proxybembem.com.br`.
- Production application code remains unchanged by the expansion branch.
- Production Supabase now includes migration `20260902091641_admin_order_operations_foundation` in addition to the prior seven migrations.

## End-of-session rule

Every meaningful session must update this file with exact phase/task, fresh evidence, blockers, next action, branch/commit/Preview/Production state, and decisions future sessions must not rediscover.

**Resume point:** Phase 1 code and current Supabase database foundation are implemented and validated. Branch CI is green. The only remaining Phase 1 acceptance blocker is Vercel Preview admin configuration (`NEXT_PUBLIC_SUPABASE_URL` missing in Preview); Production current application remains healthy after the database migration. Do not merge to `main` yet. Next exact action is either (a) fix/confirm Preview environment configuration so the Phase 1 branch can receive a full Preview smoke check, or, if the owner explicitly accepts proceeding despite that pre-existing Preview configuration limitation, (b) write/review the Phase 2 Admin Orders + Fulfillment implementation plan before runtime Phase 2 changes.