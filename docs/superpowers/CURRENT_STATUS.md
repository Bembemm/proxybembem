# ProxyBembem — Current Status

**Updated:** 2026-09-02

This is the canonical repository-wide continuation checkpoint. For the active admin expansion, read this file, then `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then the active phase plan.

## Active project — Admin Dashboard + Customer Account Expansion

- Branch: `feat/admin-dashboard-expansion`.
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`.
- Approved design: `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`.
- Master Plan: `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`.
- Active phase plan: `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md`.
- State: **PHASE 1 CODE IMPLEMENTED + TESTED; NON-PRODUCTION DATABASE VALIDATION BLOCKED BY ENVIRONMENT**.
- Production remains unchanged and no expansion rollout is approved.

## Phase 1 verified candidate

Code candidate before documentation checkpoint:

`0ce3b371eda1cfccbd8ddde639b07e7b7ae57848`

Exact CI:

- run `33590493640`;
- job `100123329614`;
- `pnpm test`: PASS;
- `pnpm typecheck`: PASS;
- `pnpm build`: PASS.

Full branch diff review from `main` base `b7172e86...` to candidate `0ce3b371...` found only the approved planning docs, one additive Phase 1 migration, fulfillment/metadata/event/attention/audit server modules, narrow `orders.ts` contract changes, and relevant tests/fixtures. No storefront, catalog authority, customer-account UI, label flow, hosting, or admin UI changes entered Phase 1.

### Implemented Phase 1 foundation

- `supabase/migrations/202609020001_admin_order_operations_foundation.sql` exists in Git only; it has **not** been applied to Supabase.
- Adds compatibility-safe `orders.fulfillment_status` and conservative backfill.
- Adds `order_events`, `order_attention_flags`, and append-only `admin_audit_log` with RLS/browser-role restrictions.
- Existing Mercado Pago payment RPC keeps the same input signature and now atomically handles the one allowed automatic fulfillment transition plus payment-related events/attention.
- `lib/server/fulfillment.ts` provides stable fulfillment vocabulary/transition rules.
- `lib/server/safe-metadata.ts` recursively blocks secret/internal metadata and unsafe JSON shapes.
- `lib/server/order-events.ts` uses explicit `on_conflict=dedupe_key` only for real dedupe requests.
- `lib/server/order-attention.ts` treats only the named partial-index `23505` duplicate as idempotent; unrelated conflicts fail.
- `lib/server/admin-audit.ts` exposes append/list only, with no update/delete API.
- `lib/server/orders.ts` strictly validates the new RPC result while keeping the payment RPC request body unchanged.

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

## Supabase environment discovery

Connected Supabase state checked on 2026-09-02:

- one project exists: `ProxyBembem`;
- region: `sa-east-1`;
- status: healthy;
- development branches: **none**.

Because no clearly non-Production database exists, **no migration was applied**. Do not use the sole connected `ProxyBembem` project as a test database without explicit Production authorization.

Supabase supports creating a development branch, but branch creation has a cost-confirmation workflow. Before creating one, the owner must confirm which Supabase organization to use; then query current cost, show it to the owner, obtain confirmation, and only then create the branch.

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

## Production baseline — unchanged

- Repo: `Bembemm/proxybembem`.
- Canonical `main`: `b7172e86ec5bc1c4a773e99ef0886ce512649110`.
- Existing Production deployment: `dpl_DFZhbQpkxZ8CRqJsLKx2jU8v9MAX`, READY.
- Canonical domains: `https://www.proxybembem.com.br` and `https://proxybembem.com.br`.
- Production-accepted checkout, payment, public order tracking, freight, `/produtos`, PB PNG branding, and admin MFA/session behavior remain untouched by this expansion.
- Pre-expansion Production migrations remain the seven existing migrations through `202608310001_admin_sessions.sql`.

## End-of-session rule

Every meaningful session must update this file with exact phase/task, fresh evidence, blockers, next action, branch/commit/Preview/Production state, and decisions future sessions must not rediscover.

**Resume point:** Phase 1 code is implemented and verified on `feat/admin-dashboard-expansion`, but its migration has not been applied anywhere. The only connected Supabase project has no development branch. Next step is an owner decision about creating a Supabase development branch; do not apply SQL to the sole existing project without explicit Production authorization.
