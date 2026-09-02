# ProxyBembem — Current Status

**Updated:** 2026-09-02

This is the canonical repository-wide continuation checkpoint. For the active admin expansion, read this file, then `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then the active phase plan.

## Active project — Admin Dashboard + Customer Account Expansion

- Branch: `feat/admin-dashboard-expansion`.
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`.
- Approved design: `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`.
- Master Plan: `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`.
- Phase 1 plan: `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md`.
- State: **PHASE 1 TASK 1 RED CAPTURED — PRODUCTION CODE NOT STARTED**.
- Test-only commit: `bcebfdc71e28f7b54141e7f32a97f45c5782bb41`.
- Master Plan RED checkpoint commit: `313aa115e135d58c2b9971121808af9788568f7c`.
- No expansion migration has been created/applied yet.
- Production is unchanged and no expansion Production rollout is approved.

### Fresh RED evidence

Command:

`node --experimental-strip-types --test tests/admin-order-foundation-migration.test.ts`

Result:

- 3 tests;
- 0 passed;
- 3 failed;
- all failures were the expected `ENOENT` for missing `supabase/migrations/202609020001_admin_order_operations_foundation.sql`.

This is the intended TDD RED state: the migration behavior is specified before the migration exists.

### Phase 1 exact next action

Create `supabase/migrations/202609020001_admin_order_operations_foundation.sql` according to Task 2 of the Phase 1 plan, then rerun the focused migration test for GREEN.

The migration must remain compatibility-safe and additive. It will introduce:

- `orders.fulfillment_status` with conservative backfill;
- `order_events`;
- `order_attention_flags`;
- `admin_audit_log`;
- the upgraded existing Mercado Pago payment RPC that atomically performs the one allowed automatic fulfillment transition.

Do not implement `/admin` order pages, customer accounts, catalog migration, labels, notifications, settings, or dashboard metrics during Phase 1.

### Phase 1 decisions future chats must preserve

- `order_events` dedupe through PostgREST must explicitly target `on_conflict=dedupe_key` with `resolution=ignore-duplicates` when a dedupe key exists.
- Active attention uniqueness uses a partial unique index; do not pretend `(order_id, code)` is a normal PostgREST upsert target. Treat only the named `23505` partial-index duplicate as idempotent.
- Event/attention/audit caller-provided metadata receives bounded recursive secret/internal-key validation.
- Payment-side event/attention writes remain inside the trusted Mercado Pago database RPC so payment + automatic fulfillment side effects are one transaction.

## Architectural decisions future sessions must not rediscover

- Modular monolith inside existing Next.js + Supabase application.
- Keep `/admin`; security never depends on hiding/randomizing its URL.
- Preserve admin password + mandatory Authenticator TOTP/AAL2, single active session, 30-minute inactivity, server-side fail-closed authorization.
- Payment status is Mercado Pago/provider-authoritative; admin cannot force paid/refunded locally.
- Fulfillment is independent: `awaiting_payment -> awaiting_production -> in_production -> ready_to_ship -> shipped -> completed`; `canceled` is exceptional/terminal where valid.
- Only trusted approved payment automatically advances `awaiting_payment -> awaiting_production`.
- Refund/chargeback creates attention without falsifying the physical state.
- No generic arbitrary admin order/payment PATCH.
- Order lifecycle events and admin audit are append-oriented and separate.
- Address may be corrected before label purchase; after purchase it cannot silently diverge from the active label.
- Customer account is optional and uses email + permanent password + email verification + password reset.
- Email is the login identity; names may duplicate; immutable Auth UUID owns customer/order relationships.
- Guest checkout and existing public-token order tracking remain.
- Guest/old order claiming requires trusted proof and never a name match alone.
- Customer permanent profile stays minimal; payment cards are never stored.
- Catalog moves to Supabase in stages; checkout remains server-authoritative and historical order snapshots remain immutable.
- Label purchase never happens automatically after payment and always requires explicit admin confirmation.
- Melhor Envio scope expansion follows least privilege and current official docs at implementation time.
- Read-only tracking may synchronize automatically without altering financial state.
- Transactional email uses an outbox/job model; email-provider failure cannot break payment/order persistence.
- Store settings expose only safe commercial/operational values; secrets remain runtime configuration.
- Admin UI follows current admin visual model; customer account follows storefront identity.
- Database migrations are compatibility-first/additive before hardening.
- Existing historical orders receive no fabricated production/shipping events.
- `IMPLEMENTED`, `TESTED`, `PREVIEW APPROVED`, and `PRODUCTION APPROVED` are distinct.
- No merge/high-risk Production action without explicit owner approval.
- Do not delete feature branches unless owner explicitly requests cleanup.

## Production baseline — unchanged

Repository: `Bembemm/proxybembem`.

- PR #2 (`feat: adicionar checkout seguro com Mercado Pago`) was explicitly approved and merged into `main`.
- Merge commit: `1f0bff2c88901a5e0bd0c910e3f650264bceb79b`.
- Current canonical `main`: `b7172e86ec5bc1c4a773e99ef0886ce512649110`.
- Final main CI #744 passed on that SHA.
- Canonical Production deployment: `dpl_DFZhbQpkxZ8CRqJsLKx2jU8v9MAX`, READY, sourced from `main` SHA `b7172e86ec5bc1c4a773e99ef0886ce512649110`.
- Canonical domains: `https://www.proxybembem.com.br` and `https://proxybembem.com.br`.

### Production-accepted behavior

- Dedicated `/produtos` catalog page; Home keeps featured-only section.
- PB branding served directly from `/brand/pb.png`.
- Product production/posting copy: up to 5 business days.
- Product 1: Commander 100 — R$150.00 original / R$119.90 sale.
- Product 2: Proxy 60 — R$99.99 original / R$69.99 sale.
- Mercado Pago Checkout Pro + signed webhook + server-side payment fetch + atomic Supabase payment transition accepted in Production.
- Public order status flow accepted.
- Melhor Envio Production OAuth active for current freight calculation; freight restricted to PAC/SEDEX IDs 1/2.
- Admin login password + mandatory TOTP/AAL2 accepted; one active app session; 30-minute inactivity timeout; auth failures fail closed.

### Applied Production Supabase migrations before this expansion

1. `202608280001_create_orders.sql`
2. `202608280002_shipping_checkout_hardening.sql`
3. `202608280003_atomic_payment_events.sql`
4. `202608290001_restrict_rls_auto_enable.sql`
5. `202608290002_melhor_envio_oauth.sql`
6. `202608300001_checkout_preference_lease.sql`
7. `202608310001_admin_sessions.sql`

## Historical debugging decisions

- Vercel Hobby previously hit `build-rate-limit`; do not create repeated dummy commits while rate-limited.
- Android/Termux native Next/SWC is the local build limitation for Next 16.3.3; GitHub CI/Linux remains authoritative full-build evidence.
- Termux Webpack/WASM testing exposed a latent strict route-export issue in `app/api/internal/melhor-envio/refresh/route.ts`; do not confuse it with a known Production failure.
- Keep the accepted PB image path `/brand/pb.png`.

## End-of-session rule

Every meaningful session must update this file with current phase/task, fresh passed/failed evidence, blockers, exact next action, relevant branch/commit/Preview/Production evidence, and decisions future sessions must not rediscover.

**Resume point:** Phase 1 Task 1 RED is captured on `feat/admin-dashboard-expansion`. The migration does not yet exist. Next action is Task 2: implement the additive migration and rerun the migration test for GREEN. Existing `main`/Production baseline remains unchanged.
