# ProxyBembem Admin Dashboard Expansion — Master Plan

> **For agentic workers:** This document is the operational source of truth for the admin-dashboard/customer-account expansion. Read the approved design, then this file, then the active phase plan. Each implementation phase requires its own detailed plan under `docs/superpowers/plans/` before production code changes. Use TDD and explicit owner approval before merge or Production rollout.

**Goal:** Expand the existing secure `/admin` into a complete operational store dashboard and add an optional customer account area without weakening the Production-accepted checkout, payment, freight, or admin-auth flows.

**Architecture:** Modular monolith in the existing Next.js + Supabase application. Orders/fulfillment, payments, customers, catalog, shipments, notifications, settings, audit, and dashboard metrics stay in one deployable application but use separate data models, server modules, authorization boundaries, tests, and rollout gates.

**Tech Stack:** Next.js 16.3.3, React 19, TypeScript 5.7.3, Supabase Auth/Postgres/REST/RPC, Mercado Pago Checkout Pro, Melhor Envio OAuth/API, Tailwind CSS 4, Node built-in test runner.

**Approved design:** `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`

**Working branch:** `feat/admin-dashboard-expansion`

**Branch base:** `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`

---

## 0. Operating Rules

### Status semantics

- `[ ]` not started.
- `[~]` in progress; evidence incomplete.
- `[x]` completed and required evidence recorded.

Never collapse these states: `IMPLEMENTED`, `TESTED`, `PREVIEW APPROVED`, `PRODUCTION APPROVED`.

A passing test suite does not authorize Production. A Ready Preview does not authorize merge. Merge/Production changes require explicit owner approval.

### Phase-plan rule

This file controls sequence, dependencies, evidence, and continuity. Each large subsystem has a separate code-level plan:

1. `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md`
2. `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`
3. `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
4. `docs/superpowers/plans/2026-09-02-database-catalog-admin-products.md`
5. `docs/superpowers/plans/2026-09-02-melhor-envio-shipments-labels.md`
6. `docs/superpowers/plans/2026-09-02-transactional-notifications.md`
7. `docs/superpowers/plans/2026-09-02-store-settings.md`
8. `docs/superpowers/plans/2026-09-02-admin-dashboard-metrics.md`
9. `docs/superpowers/plans/2026-09-02-admin-expansion-hardening-rollout.md`

If a phase must be split, record the reason and new plan path here before implementation.

### End-of-session rule

Every meaningful session updates this file's **Current Session Checkpoint** and `docs/superpowers/CURRENT_STATUS.md` with exact phase/task, last verified commit, RED/GREEN evidence, full verification state, Preview/Production state, blockers, next exact action, and decisions future sessions must not rediscover.

---

## 1. Non-Negotiable Constraints

- [x] Keep `/admin`; URL secrecy is not a security boundary.
- [x] Existing admin UUID + Supabase session + mandatory TOTP/AAL2 + server-side admin session remain required.
- [x] Customer auth and admin authorization remain separate.
- [x] Mercado Pago/provider remains authoritative for payment status; admin cannot force financial state locally.
- [x] Guest checkout remains supported.
- [x] Browser prices/shipping dimensions are never trusted.
- [x] Historical `orders.items` snapshots remain immutable purchase truth.
- [x] Label purchase never happens automatically after payment.
- [x] Provider/auth/database secrets never enter client responses, logs, docs, events, audit, or commits.
- [x] New migrations are compatibility-first/additive before constraint hardening.
- [x] Existing orders receive no fabricated production/shipping history.
- [x] Secondary provider failures cannot corrupt critical order/payment state.
- [x] High-risk actions require confirmation + server preconditions + audit where applicable.
- [x] Admin UI keeps the current light/card/violet responsive model; customer account follows storefront identity.
- [x] Hosting migration remains a separate project.

---

## 2. Existing Code Boundaries

Preserve and inspect before changing behavior:

- `lib/server/admin-auth-core.ts`, `admin-auth.ts`, `admin-session-repository.ts` — admin security.
- `lib/server/orders.ts` — order persistence/payment RPC interface.
- `lib/server/checkout-order.ts`, `checkout-flow.ts`, `checkout-idempotency.ts`, `checkout-preference-lease.ts` — trusted checkout/idempotency.
- `lib/server/melhor-envio-oauth-*` — existing Melhor Envio OAuth/token lifecycle.
- `lib/server/env.ts` — runtime configuration boundary.
- `app/admin/page.tsx` — current admin visual model.
- `app/admin/integrations/melhor-envio/...` — current admin integration UI.
- public `/pedido/...` + `components/order-status.tsx` — guest order tracking.
- `data/products.ts` — current static catalog authority until Phase 4 switch.
- Tests remain `tests/*.test.ts`; full gates are `pnpm test`, `pnpm typecheck`, `pnpm build`.

---

# PHASE 0 — Design + Master Planning

**Objective:** Lock architecture, branch, dependency order, and continuation format before implementation.

- [x] Create `feat/admin-dashboard-expansion` from current `main`.
- [x] Write approved design at `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`.
- [x] Owner approved written design by instructing work to continue.
- [x] Create this Master Plan.
- [x] Create/review Phase 1 implementation plan at `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md`.
- [x] Phase 1 plan self-review fixed PostgREST dedupe handling, partial-index attention conflict handling, and recursive secret-metadata validation before runtime implementation.

**Production impact:** None. Documentation only.

**Exit:** COMPLETE. Runtime implementation has not started.

---

# PHASE 1 — Data + Audit Foundation

**Detailed plan:** `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md`

**Objective:** Add durable fulfillment, attention, order-event, and admin-audit primitives without changing customer-visible checkout behavior.

### Schema/RPC

- [ ] Add compatibility-safe `orders.fulfillment_status`.
- [ ] Backfill approved -> `awaiting_production`; other existing orders -> `awaiting_payment`; fabricate no past events.
- [ ] Add `order_events` append-oriented history.
- [ ] Add `order_attention_flags` for multiple independent active problems.
- [ ] Add append-only `admin_audit_log`.
- [ ] Keep browser roles blocked by RLS/grants.
- [ ] Extend existing atomic Mercado Pago RPC without changing its input signature.
- [ ] Approved payment atomically advances only `awaiting_payment -> awaiting_production`.
- [ ] Duplicate/replayed payment events do not duplicate operational events.
- [ ] Refund/chargeback keeps physical fulfillment unchanged and opens critical attention.
- [ ] Manual-review mismatch opens critical attention.

### Server foundations

- [ ] Add pure `fulfillment.ts` transition rules.
- [ ] Add recursive bounded `safe-metadata.ts` validation against secret-like/internal keys.
- [ ] Add `order-events.ts` with explicit `on_conflict=dedupe_key` behavior for PostgREST dedupe.
- [ ] Add `order-attention.ts` that handles the named partial-index duplicate conflict safely instead of pretending the partial unique index is a normal upsert target.
- [ ] Add append/list-only `admin-audit.ts`.
- [ ] Extend `orders.ts` typed payment result with fulfillment fields.

### Evidence gate

- [ ] RED tests captured for each new unit.
- [ ] Focused migration/state/repository tests PASS.
- [ ] `pnpm test` PASS.
- [ ] `pnpm typecheck` PASS.
- [ ] `pnpm build` PASS.
- [ ] Non-Production migration/RPC validation succeeds.
- [ ] Preview smoke check confirms existing checkout/public order/admin-auth behavior.
- [ ] Owner approval obtained before any Production migration/deploy.

**Rollback:** Additive schema can remain while Phase 1 code rolls back; do not drop existing checkout/payment data.

---

# PHASE 2 — Admin Orders + Fulfillment

**Plan path:** `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`

- [ ] Write/review the Phase 2 detailed plan after Phase 1 acceptance.
- [ ] Add responsive admin navigation preserving current visual model.
- [ ] `/admin/pedidos`: server-side pagination/search/filter by order, payment, fulfillment, attention, date.
- [ ] `/admin/pedidos/[id]`: order snapshot, totals/freight, customer/address, safe payment details, fulfillment actions, attention, timeline, audit.
- [ ] `/admin/producao`: queues for awaiting production, in production, ready to ship.
- [ ] Explicit start-production/ready-to-ship/shipped/completed/cancel operations.
- [ ] No arbitrary payment mutation.
- [ ] All writes re-check admin authorization and write required event/audit evidence.
- [ ] Focused auth/transition/UI tests + full gates PASS.
- [ ] Owner manually approves Preview before Production.

**Rollback:** Disable new admin order routes/actions; Phase 1 schema remains additive.

---

# PHASE 3 — Customer Account + Owned Orders

**Plan path:** `docs/superpowers/plans/2026-09-02-customer-account-orders.md`

- [ ] Write/review Phase 3 plan.
- [ ] Add `customer_profiles` + nullable `orders.customer_id`.
- [ ] Email + permanent password + email verification + reset by email.
- [ ] Email unique/case-insensitive; names not identities; immutable Auth UUID owns relationships.
- [ ] Keep profile minimal: name, verified email representation, WhatsApp/contact, timestamps.
- [ ] Guest checkout remains functional.
- [ ] Logged-in checkout links order from trusted server session, never browser-supplied customer UUID.
- [ ] Preserve public-token guest tracking.
- [ ] Secure claim flow for old/guest orders; never name match alone.
- [ ] `/minha-conta`, `/minha-conta/pedidos`, order detail, profile, security.
- [ ] “Falar sobre este pedido” opens WhatsApp with order number.
- [ ] Customer DTOs intentionally exclude internal fields/audit/provider data.
- [ ] Account isolation/takeover/guest regression tests + full gates PASS.

**Rollback:** Disable account UI while guest checkout/public-token tracking continue.

---

# PHASE 4 — Database Catalog + Admin Products

**Plan path:** `docs/superpowers/plans/2026-09-02-database-catalog-admin-products.md`

- [ ] Write/review Phase 4 plan.
- [ ] Add validated `products` table with stable ID, integer-cent prices, content, active/featured state, shipping metadata.
- [ ] Seed exact current products/values.
- [ ] Build trusted DB reader and parity tests against `data/products.ts`.
- [ ] `/admin/produtos` and `/admin/produtos/[id]` with explicit save/confirmation/audit.
- [ ] Do not trust browser price/dimensions.
- [ ] Keep static authority during rollout; switch only after Preview parity acceptance.
- [ ] After DB authority switch, DB failure fails checkout closed rather than silently using browser/stale data.
- [ ] Historical order snapshots remain unchanged after product edits.
- [ ] Full gates + Preview checkout acceptance PASS.

**Rollback:** Re-select/redeploy known static authority while preserving orders already created under DB authority.

---

# PHASE 5 — Melhor Envio Shipments, Labels + Tracking

**Plan path:** `docs/superpowers/plans/2026-09-02-melhor-envio-shipments-labels.md`

- [ ] Write/review Phase 5 plan.
- [ ] Re-check current official Melhor Envio endpoints/scopes immediately before implementation.
- [ ] Least-privilege OAuth expansion only for required calculate/cart/purchase/generate/print/tracking/read/cancel capabilities.
- [ ] Add dedicated `shipments` model; no provider token in shipment rows.
- [ ] Address can be corrected before label purchase; after purchase no silent divergence.
- [ ] `ready_to_ship` -> prepare -> show final cost -> explicit purchase confirmation -> generate -> print -> track.
- [ ] Payment approval never spends Melhor Envio balance.
- [ ] Tracking may sync automatically/read-only; failure does not change finances.
- [ ] Idempotency prevents accidental double purchase as provider contract permits.
- [ ] Sandbox OAuth/cart/purchase/generation/print/tracking/cancel acceptance.
- [ ] Production label capability requires separate explicit owner approval.

**Rollback:** Disable label management while existing freight calculation continues.

---

# PHASE 6 — Transactional Notification Outbox

**Plan path:** `docs/superpowers/plans/2026-09-02-transactional-notifications.md`

- [ ] Write/review Phase 6 plan.
- [ ] Select Production-capable email/SMTP mechanism and keep credentials runtime-only.
- [ ] Add idempotent `notification_jobs`/outbox with retries and safe error summary.
- [ ] Email provider downtime never fails payment/order state.
- [ ] Transactional templates: verification/reset, order created, payment approved, production, ready-to-ship where useful, shipped/tracking, cancellation/refund.
- [ ] No marketing newsletter or automated WhatsApp provider scope.
- [ ] Admin order detail shows safe notification status/history.
- [ ] Duplicate event/retry/failure-redaction tests + full gates PASS.

**Rollback:** Stop processor; queued records remain; checkout/payment/fulfillment continue.

---

# PHASE 7 — Store Settings

**Plan path:** `docs/superpowers/plans/2026-09-02-store-settings.md`

- [ ] Write/review Phase 7 plan.
- [ ] Narrow typed allowlist: production lead time, public contact data, selected operational copy/approved options.
- [ ] Never expose/edit provider/auth/database secrets or immutable admin identity.
- [ ] `/admin/configuracoes`: explicit save, validation, confirmation for high-impact values, audit.
- [ ] Move approved code-owned settings one by one; avoid turning every string into a DB setting.
- [ ] Settings/security/regression tests + full gates PASS.

**Rollback:** Restore safe code/default typed value without touching orders/provider secrets.

---

# PHASE 8 — Admin Dashboard Metrics + Attention Center

**Plan path:** `docs/superpowers/plans/2026-09-02-admin-dashboard-metrics.md`

- [ ] Write/review Phase 8 plan.
- [ ] Stable definitions for orders and approved value today/week/month.
- [ ] Counts: awaiting production, in production, ready to ship, shipped, attention, refund/chargeback/manual review.
- [ ] Product quantities sold from immutable snapshots.
- [ ] Explicit timezone/date boundaries.
- [ ] `/admin` prioritizes actionable cards/queues; preserve integration links.
- [ ] Bounded aggregate queries/indexes; never load all orders in browser to calculate metrics.
- [ ] Background refresh does not keep admin inactivity alive.
- [ ] Aggregate/UI tests + full gates + manual Preview review PASS.

**Rollback:** Restore simpler admin landing; direct operational pages remain usable.

---

# PHASE 9 — Hardening, Preview Acceptance + Production Rollout

**Plan path:** `docs/superpowers/plans/2026-09-02-admin-expansion-hardening-rollout.md`

### Security/idempotency

- [ ] Anonymous/AAL1/wrong UUID/customer cannot access admin operations.
- [ ] Customer A cannot access Customer B resources.
- [ ] Guest token exposes only customer-safe order data.
- [ ] Sensitive write routes keep CSRF/origin/rate-limit protections where applicable.
- [ ] Logs/audit/events contain no secrets.
- [ ] Admin inactivity/single-session remains correct across polling/new routes.
- [ ] Duplicate payment, fulfillment, claim, label, notification operations remain safe/idempotent.

### Full regression

- [ ] Guest checkout.
- [ ] Authenticated checkout.
- [ ] Trusted catalog pricing.
- [ ] Freight quote.
- [ ] Mercado Pago Sandbox/test transition.
- [ ] Customer ownership isolation.
- [ ] Admin production/audit.
- [ ] Melhor Envio Sandbox labels/tracking.
- [ ] Notification success/failure/retry.
- [ ] Settings.
- [ ] Dashboard metrics.
- [ ] Existing public order page.
- [ ] Existing admin MFA/logout/timeout/single-session.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm build`, exact-candidate GitHub CI PASS.

### Manual Preview + Production

- [ ] Candidate Preview READY.
- [ ] Owner reviews admin, orders/production, customer account, products, shipment flow, mobile/responsive behavior.
- [ ] Preview runtime error/fatal logs reviewed.
- [ ] Owner explicitly approves Production candidate.
- [ ] Apply Production migrations in compatibility-safe order only after approval.
- [ ] Reauthorize real Melhor Envio scopes only at approved rollout step.
- [ ] Enable real label spending, live customer email, and DB catalog authority only at their explicit approved gates.
- [ ] Monitor high-risk enablements immediately.
- [ ] Do not merge branch without explicit owner permission.
- [ ] After merge verify exact `main` CI/deployment source SHA/canonical aliases.
- [ ] Do not delete feature branch unless owner requests cleanup.

---

## 10. Data Ownership Map

| Domain | Authority | Mutation rule |
| --- | --- | --- |
| Payment | Mercado Pago + trusted RPC | Admin cannot force provider state |
| Fulfillment | `orders.fulfillment_status` | Explicit admin operations + one approved-payment auto transition |
| Purchase snapshot | `orders.items` | Trusted checkout creates; historical value immutable |
| Customer identity | Supabase Auth UUID | Name/email text is not relational ownership |
| Customer profile | `customer_profiles` | Minimal profile; separate from order delivery data |
| Catalog | `products` after staged switch | Admin operations; checkout server reader only |
| Shipment | `shipments` + provider | Spending/cancel requires confirmation |
| Order timeline | `order_events` | Append-oriented domain events |
| Admin audit | `admin_audit_log` | Append-only normal interface |
| Notification | `notification_jobs` | Failure never rolls back payment/order |
| Settings | typed `store_settings` | Commercial/operational only; no secrets |

---

## 11. Decisions Future Chats Must Not Rediscover

1. Modular monolith; no giant generic dashboard and no microservices.
2. Keep `/admin`; security is server authorization, not URL secrecy.
3. Preserve admin MFA/AAL2/single-session/30-minute inactivity/fail-closed rules.
4. Payment provider-authoritative; admin cannot manually mark paid/refunded.
5. Fulfillment: `awaiting_payment -> awaiting_production -> in_production -> ready_to_ship -> shipped -> completed`; `canceled` exceptional/terminal.
6. Only trusted approved payment automatically enters `awaiting_production`.
7. Refund/chargeback adds attention without rewinding physical state.
8. No generic admin order/payment PATCH.
9. Order events and admin audit are separate append-oriented concepts.
10. Address may change before label purchase; afterward use cancellation/recreation or provider-safe equivalent.
11. Customer account optional: email + permanent password + verification + reset.
12. Email is login identity; names can duplicate; immutable Auth UUID owns orders.
13. Guest checkout/public-token tracking remain.
14. Old/guest order claiming needs secure proof, never name alone.
15. Customer permanent profile is minimal; cards never stored.
16. Catalog moves to Supabase in stages; checkout remains server-authoritative.
17. Historical order snapshots never follow catalog edits.
18. Label purchase is always explicit; payment never auto-spends shipping balance.
19. Melhor Envio scopes verified against current official docs at implementation time and least-privilege.
20. Tracking can sync automatically/read-only; failure does not change finances.
21. Transactional email uses outbox/job isolation.
22. Automated WhatsApp/marketing are out of this initial scope; WhatsApp is direct contact.
23. Store settings are safe operational/commercial values only.
24. Dashboard prioritizes actionable persisted metrics.
25. Migrations compatibility-first; no invented historical events.
26. `IMPLEMENTED`, `TESTED`, `PREVIEW APPROVED`, `PRODUCTION APPROVED` remain distinct.
27. No high-risk Production/merge action without explicit owner approval.
28. No feature-branch deletion without owner request.

---

# 12. Current Session Checkpoint

**Status:** MASTER PLAN + PHASE 1 IMPLEMENTATION PLAN WRITTEN; RUNTIME IMPLEMENTATION NOT STARTED

**Current phase:** Phase 1 — Data + Audit Foundation

**Current task:** Planning gate complete; awaiting selection of implementation execution mode before Task 1 RED test is written.

**Branch:** `feat/admin-dashboard-expansion`

**Branch base:** `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`

**Approved spec:** `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`

**Master Plan:** `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`

**Active phase plan:** `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md`

**Implementation:** NOT STARTED

**Expansion migrations created/applied:** NONE

**Planning evidence:**

- architectural spec reviewed and owner-approved;
- Master Plan written and reviewed;
- Phase 1 detailed plan written and self-reviewed;
- self-review corrections: explicit PostgREST `dedupe_key` conflict target, correct partial-index duplicate handling for attention, recursive bounded secret-metadata validation.

**Runtime verification:**

- focused runtime tests: not run — no runtime code changed;
- `pnpm test`: not run — planning-only checkpoint;
- `pnpm typecheck`: not run — planning-only checkpoint;
- `pnpm build`: not run — planning-only checkpoint.

**Preview:** Not required for planning-only commits.

**Production:** NOT APPROVED / NOT CHANGED.

**Blockers:** None known.

**NEXT EXACT ACTION:** Begin Phase 1 Task 1 using the approved plan: write `tests/admin-order-foundation-migration.test.ts`, run it alone, capture the expected RED failure because migration `202609020001_admin_order_operations_foundation.sql` does not exist, and record that RED evidence before writing the migration.

**DO NOT REDISCOVER:** Read Section 11 and the active Phase 1 plan before execution. Do not touch `/admin` UI, customer accounts, catalog authority, label purchase, or Production in Phase 1.
