# ProxyBembem Admin Dashboard Expansion — Master Plan

> **For agentic workers:** This document is the operational source of truth for the entire admin-dashboard/customer-account expansion. Read the approved design first, then this file, then the active phase plan. Each implementation phase requires its own detailed plan under `docs/superpowers/plans/` before production code is changed. Use TDD, frequent verification, and explicit owner approval before merge or Production rollout.

**Goal:** Expand the existing secure `/admin` into a complete operational store dashboard and add an optional customer account area without weakening the Production-accepted checkout, payment, freight, or admin-auth flows.

**Architecture:** Modular monolith in the existing Next.js application. Orders/fulfillment, payments, customers, catalog, shipments, notifications, settings, audit, and dashboard metrics remain one deployable application but have separate data models, server modules, authorization boundaries, APIs, tests, and rollout gates.

**Tech Stack:** Next.js 16.3.3, React 19, TypeScript 5.7.3, Supabase Auth/Postgres/REST/RPC, Mercado Pago Checkout Pro, Melhor Envio OAuth/API, Tailwind CSS 4, Node test runner (`node --experimental-strip-types --test`).

**Approved design:** `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`

**Working branch:** `feat/admin-dashboard-expansion`

**Branch base:** `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`

---

## 0. How to use this document

### 0.1 Status semantics

- `[ ]` — not started.
- `[~]` — in progress; evidence is incomplete.
- `[x]` — completed and required evidence is recorded.

A checkbox is not complete merely because code exists. Where applicable, completion requires the task's focused tests plus the repository verification gates and any Preview/manual acceptance required by the task.

### 0.2 Required status distinction

Never collapse these states:

- `IMPLEMENTED`
- `TESTED`
- `PREVIEW APPROVED`
- `PRODUCTION APPROVED`

Passing tests does not authorize Production. A Ready Preview does not authorize merge. Merge/Production changes require explicit owner approval.

### 0.3 Required phase-plan rule

This master plan controls sequence and continuity. It is intentionally not a single giant code-level implementation plan.

Before touching production code for each major phase, create and commit the corresponding detailed phase plan using the `writing-plans` workflow. The phase plan must contain exact files, interfaces, TDD steps, commands, expected failures/passes, migration sequencing, rollback, and commits.

Planned phase-plan paths:

1. `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md`
2. `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`
3. `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
4. `docs/superpowers/plans/2026-09-02-database-catalog-admin-products.md`
5. `docs/superpowers/plans/2026-09-02-melhor-envio-shipments-labels.md`
6. `docs/superpowers/plans/2026-09-02-transactional-notifications.md`
7. `docs/superpowers/plans/2026-09-02-store-settings.md`
8. `docs/superpowers/plans/2026-09-02-admin-dashboard-metrics.md`
9. `docs/superpowers/plans/2026-09-02-admin-expansion-hardening-rollout.md`

If a phase is later split further, record the reason here and add the new plan path before implementation.

### 0.4 End-of-session checkpoint rule

Every meaningful session on this expansion must update:

1. this master plan's **Current Session Checkpoint**;
2. the active phase's checkbox/evidence;
3. `docs/superpowers/CURRENT_STATUS.md` with a concise repository-wide checkpoint.

The checkpoint must record exact current phase/task, last verified commit, verification evidence, Preview state, Production state, blockers, next exact action, and decisions that must not be rediscovered.

---

## 1. Non-negotiable global constraints

These apply to every phase.

- [x] Keep `/admin`; do not rely on a secret/random admin URL for security.
- [x] Admin authorization remains server-side and requires the existing approved admin UUID + Supabase session + TOTP/AAL2 + valid server-side admin session.
- [x] Customer authentication and admin authorization remain separate security boundaries.
- [x] Payment status remains Mercado Pago/provider-authoritative; no generic admin field edit may force financial status.
- [x] Guest checkout remains supported.
- [x] Browser-supplied prices and shipping dimensions are never trusted.
- [x] Historical `orders.items` snapshots remain immutable purchase truth.
- [x] Label purchase never happens automatically after payment approval.
- [x] Provider tokens, password hashes, TOTP secrets, Supabase secrets, Mercado Pago secrets, Melhor Envio secrets, encryption keys, and `ADMIN_USER_ID` never appear in client responses, logs, screenshots, docs, or commits.
- [x] New migrations are compatibility-first: additive/default-safe before tightening constraints.
- [x] Existing orders never receive fabricated production/shipping history.
- [x] Secondary-provider failures must not corrupt critical order/payment state.
- [x] High-risk admin actions require explicit confirmation and audit evidence.
- [x] Admin interface keeps the current light/card/violet responsive model; customer account follows the storefront identity.
- [x] Hosting migration is a separate project and does not enter this scope.

---

## 2. Existing code boundaries to preserve

These are the current integration points future workers should inspect before changing behavior.

### Existing server modules

- `lib/server/admin-auth-core.ts` — admin authorization policy/core decisions.
- `lib/server/admin-auth.ts` — protected admin page/API/session behavior.
- `lib/server/admin-session-repository.ts` — persistent admin-session rules.
- `lib/server/orders.ts` — existing order persistence and Mercado Pago payment application interface.
- `lib/server/checkout-order.ts` — trusted server-side cart/catalog reconstruction.
- `lib/server/checkout-flow.ts` — checkout orchestration.
- `lib/server/checkout-idempotency.ts` / `checkout-preference-lease.ts` — checkout concurrency/idempotency protections.
- `lib/server/melhor-envio-oauth-*` — existing OAuth/token lifecycle.
- `lib/server/env.ts` — runtime configuration boundary.

### Existing UI/API roots

- `app/admin/page.tsx` — existing admin visual model.
- `app/admin/integrations/melhor-envio/...` — current admin integration UI.
- `app/api/admin/logout/...` and `app/api/admin/session/...` — current admin API namespace.
- `components/order-status.tsx` / public `/pedido/...` flow — existing guest order tracking behavior.
- `data/products.ts` — current trusted static catalog authority during migration period.

### Existing test convention

- Tests live in `tests/*.test.ts`.
- Full suite: `pnpm test`.
- Type check: `pnpm typecheck`.
- Production build: `pnpm build`.

Do not introduce an unrelated test framework or broad architecture rewrite while implementing this expansion.

---

# PHASE 0 — Design and Master Planning

**Objective:** Lock the architecture, branch, continuation format, and dependency order before implementation.

**Production impact:** None. Documentation only.

- [x] Branch `feat/admin-dashboard-expansion` created from current `main`.
- [x] Approved architectural design written to `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`.
- [x] Design records payment/fulfillment separation, customer account model, catalog migration, shipment rules, notification outbox, settings, audit, UI model, migration policy, Preview/Production gates, and rollback principles.
- [x] Owner approved the written design by instructing the work to continue.
- [x] Master Plan created at `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`.
- [ ] Create the Phase 1 detailed implementation plan before any schema/code implementation.

**Exit criterion:** This phase is complete when the Master Plan is committed and Phase 1 plan creation becomes the exact next action.

**Rollback:** Documentation commits can be reverted with no runtime effect.

---

# PHASE 1 — Data + Audit Foundation

**Objective:** Add the minimum durable data primitives required by later phases without changing customer-visible checkout behavior.

**Dependency:** Phase 0 complete.

**Detailed plan required:** `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md`

### 1.1 Database design/migration

- [ ] Add compatibility-safe fulfillment state to existing orders.
- [ ] Define allowed internal fulfillment values: `awaiting_payment`, `awaiting_production`, `in_production`, `ready_to_ship`, `shipped`, `completed`, `canceled`.
- [ ] Backfill existing orders conservatively: approved -> `awaiting_production`; non-approved -> `awaiting_payment`; ambiguous records flagged for review rather than invented history.
- [ ] Add a structured attention mechanism without replacing the true physical fulfillment state.
- [ ] Add `order_events` as append-oriented lifecycle history.
- [ ] Add `admin_audit_log` as append-only admin action history.
- [ ] Add constraints/indexes for common order status, event, entity, and timestamp queries.
- [ ] Preserve RLS/revocation model so normal browser users cannot mutate internal tables directly.

### 1.2 Server boundaries

- [ ] Introduce focused repository/service modules for order events and admin audit rather than expanding a generic order PATCH.
- [ ] Define explicit fulfillment transition validation independent from UI controls.
- [ ] Ensure production start rejects non-approved payment.
- [ ] Make approved-payment `awaiting_payment -> awaiting_production` transition idempotent/concurrency-safe.
- [ ] Ensure refunds/chargebacks raise attention without rewinding physical fulfillment.
- [ ] Prevent duplicate payment webhooks from duplicating operational events.

### 1.3 Test evidence

- [ ] RED tests prove invalid transitions currently fail or are unsupported for the expected reason.
- [ ] GREEN focused tests prove transition matrix and event/audit behavior.
- [ ] Migration tests validate compatibility/backfill rules.
- [ ] `pnpm test` PASS.
- [ ] `pnpm typecheck` PASS.
- [ ] `pnpm build` PASS.

### 1.4 Preview / rollout

- [ ] Create Preview from exact verified commit when the phase changes runtime behavior.
- [ ] Confirm existing checkout still creates valid orders.
- [ ] Confirm existing public order page still works.
- [ ] Confirm existing admin login/MFA still works.
- [ ] No Production migration/deploy without explicit owner approval.

**Phase 1 rollback:** New additive tables/columns remain harmless if application code is rolled back. Do not drop old columns or change checkout authority in this phase.

**Exit criterion:** Durable fulfillment/audit primitives exist, are tested, and existing Production behavior can continue unchanged.

---

# PHASE 2 — Admin Orders + Fulfillment Operations

**Objective:** Build the operational order center and production queue on top of Phase 1 primitives.

**Dependency:** Phase 1 accepted.

**Detailed plan required:** `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`

### 2.1 Admin information architecture

- [ ] Add persistent responsive admin navigation using the current visual language.
- [ ] Add `/admin/pedidos` list page.
- [ ] Add `/admin/pedidos/[id]` operational detail page.
- [ ] Add `/admin/producao` production queue.
- [ ] Keep `/admin/integrations/melhor-envio` functioning under the same auth boundary.

### 2.2 Order list

- [ ] Paginate/query server-side; do not download the entire order table into the browser.
- [ ] Search by order number and safe customer identifiers needed for operation.
- [ ] Filter by payment status, fulfillment status, attention, and useful date ranges.
- [ ] Show concise status badges and totals without exposing internal tokens/secrets.

### 2.3 Order detail

- [ ] Show order number/date and immutable purchased-item snapshot.
- [ ] Show trusted totals/freight and safe Mercado Pago details.
- [ ] Show customer/contact/delivery data required for fulfillment.
- [ ] Show fulfillment state and only valid next operational actions.
- [ ] Show attention conditions separately from fulfillment.
- [ ] Show order lifecycle timeline from `order_events`.
- [ ] Show relevant administrative audit history.
- [ ] Reserve shipment/notification sections for later phases without faking unavailable functionality.

### 2.4 Explicit admin operations

- [ ] Implement explicit start-production operation.
- [ ] Implement explicit ready-to-ship operation.
- [ ] Implement explicit shipped/completed operations only when their preconditions are satisfied.
- [ ] Implement safe cancellation semantics with reason + confirmation + audit.
- [ ] Do not expose arbitrary payment-status mutation.
- [ ] All writes re-check admin authorization server-side and record audit/history atomically where required.

### 2.5 Production queue

- [ ] Separate `awaiting_production`, `in_production`, and `ready_to_ship` operational views.
- [ ] Add safe quick actions only for reversible/low-risk transitions.
- [ ] Keep destructive, financial, and shipment-purchase actions in the detailed order flow.
- [ ] Ensure mobile layout is practical for day-to-day use.

### 2.6 Verification

- [ ] Authorization tests reject unauthenticated, AAL1, customer, or wrong-user requests.
- [ ] Transition/API tests prove invalid operations fail server-side.
- [ ] UI tests verify required order data and absence of secret/internal fields.
- [ ] `pnpm test` PASS.
- [ ] `pnpm typecheck` PASS.
- [ ] `pnpm build` PASS.
- [ ] Preview manual acceptance completed by owner before Production approval.

**Phase 2 rollback:** Disable/remove new admin order routes/actions while leaving Phase 1 schema additive and preserving existing checkout/admin integration behavior.

**Exit criterion:** Owner can safely operate production states and investigate orders entirely through `/admin` without gaining unsafe financial mutation capability.

---

# PHASE 3 — Customer Account + Customer-Owned Orders

**Objective:** Add optional email/password accounts so customers can securely see their orders without making account creation mandatory for checkout.

**Dependency:** Phase 2 stable. Phase 1 order/customer relationship primitives may be extended additively here.

**Detailed plan required:** `docs/superpowers/plans/2026-09-02-customer-account-orders.md`

### 3.1 Customer identity/data

- [ ] Add `customer_profiles` linked to immutable Supabase Auth user UUID.
- [ ] Add nullable `orders.customer_id` using compatibility-first migration.
- [ ] Enforce unique normalized/case-insensitive email through the chosen Supabase Auth/profile strategy.
- [ ] Names remain non-unique and never serve as identity.
- [ ] Keep permanent profile minimal: name, verified email representation, WhatsApp/contact, timestamps.
- [ ] Keep address/transaction-specific data on orders/shipments rather than turning profile into a full permanent dossier.

### 3.2 Auth flows

- [ ] `/criar-conta`: email + permanent password + name/contact.
- [ ] Require email verification before trusted account-owned order functionality.
- [ ] `/entrar`: email + password.
- [ ] `/esqueci-a-senha`: password reset by email.
- [ ] `/minha-conta/seguranca`: safe password-management flow.
- [ ] Ensure customer auth cannot satisfy admin authorization.
- [ ] Configure Production-capable outbound auth email delivery before Production approval; record provider/config choice in the phase plan without committing credentials.

### 3.3 Guest checkout compatibility

- [ ] Existing guest checkout remains functional.
- [ ] Authenticated checkout links new order to trusted current `customer_id` server-side.
- [ ] Browser cannot submit another customer's UUID to claim ownership.
- [ ] Existing public-token `/pedido/...` flow remains valid for guest orders.

### 3.4 Safe old/guest order claiming

- [ ] Define ownership proof using verified account email plus secure order-token/claim evidence.
- [ ] Never claim by matching name alone.
- [ ] Never claim solely by an unverified raw email string from an existing order.
- [ ] Make claim operation single-owner/idempotent and reject already-owned conflicting orders.
- [ ] Audit/security-test account-takeover edge cases.

### 3.5 Customer UI

- [ ] `/minha-conta` overview.
- [ ] `/minha-conta/pedidos` list.
- [ ] `/minha-conta/pedidos/[id]` customer-safe detail/timeline.
- [ ] `/minha-conta/perfil` for allowed profile fields.
- [ ] Show payment, production, shipping/tracking state in customer-safe wording.
- [ ] Add “Falar sobre este pedido” WhatsApp action with order number prefilled.
- [ ] Use purpose-built customer DTOs that exclude internal provider IDs/secrets, audit records, fingerprints, checkout URLs, and raw snapshots.

### 3.6 Verification

- [ ] Duplicate email account tests.
- [ ] Verification/password-reset tests.
- [ ] Customer A cannot read Customer B orders.
- [ ] Customer cannot read/administer `/admin` resources.
- [ ] Guest tracking regression tests.
- [ ] Claim-flow takeover tests.
- [ ] `pnpm test` PASS.
- [ ] `pnpm typecheck` PASS.
- [ ] `pnpm build` PASS.
- [ ] Preview manual acceptance covers create/verify/login/reset/order isolation/guest checkout.

**Phase 3 rollback:** Disable customer-account entry points while retaining guest checkout and secure public-token tracking. Nullable `customer_id` remains backward compatible.

**Exit criterion:** Accounts are optional, verified, isolated, and useful for order tracking without creating new checkout friction.

---

# PHASE 4 — Database Catalog + Admin Product Management

**Objective:** Move the trusted product authority from `data/products.ts` to Supabase in stages, then allow safe admin editing without trusting browser prices.

**Dependency:** Phase 2 admin patterns established. Phase 1 audit available.

**Detailed plan required:** `docs/superpowers/plans/2026-09-02-database-catalog-admin-products.md`

### 4.1 Product schema/seed

- [ ] Add `products` with stable product ID, title, image/reference, integer-cent prices, active/featured flags, tag/category, validated content, lead-time fields, shipping dimensions/weight, timestamps.
- [ ] Seed/migrate current product IDs 1 and 2 with exact current values.
- [ ] Add database constraints preventing invalid cents/dimensions.
- [ ] Protect direct browser mutation with RLS/revocation and server-only admin operations.

### 4.2 Catalog abstraction

- [ ] Introduce a focused trusted catalog reader interface.
- [ ] Preserve existing static catalog as rollout authority initially.
- [ ] Implement database-backed reader and parity tests against current products/prices/shipping metadata.
- [ ] Add an explicit server-side rollout selector/configuration if needed; do not silently auto-fallback to stale prices on database failure after DB authority is selected.
- [ ] Once DB authority is selected, failure to read trusted catalog fails checkout closed rather than accepting a browser price.

### 4.3 Admin product UI

- [ ] `/admin/produtos` product list.
- [ ] `/admin/produtos/[id]` validated editor.
- [ ] Save only on explicit “Salvar alterações”.
- [ ] Require confirmation for price changes/deactivation/high-impact edits.
- [ ] Record previous/new values in `admin_audit_log` without storing secrets.
- [ ] Prevent casual product-ID mutation.

### 4.4 Checkout authority switch

- [ ] Verify database product parity in Preview.
- [ ] Verify guest and authenticated checkout compute trusted totals from server DB catalog.
- [ ] Verify inactive/unknown products reject purchase.
- [ ] Verify old orders retain old snapshots after product edits.
- [ ] Switch authority only after explicit Preview acceptance.
- [ ] Keep a documented deployment/config rollback to static authority until DB source proves stable.
- [ ] Remove static catalog as authority only in a later verified cleanup; do not delete it in the same risky switch commit.

### 4.5 Verification

- [ ] Focused catalog/admin tests PASS.
- [ ] Exact current product prices parity test: product 1 R$119.90 sale; product 2 R$69.99 sale.
- [ ] Shipping-metadata parity tests PASS.
- [ ] `pnpm test` PASS.
- [ ] `pnpm typecheck` PASS.
- [ ] `pnpm build` PASS.
- [ ] Preview checkout acceptance completed before DB authority Production switch.

**Phase 4 rollback:** Select/redeploy known static catalog authority while preserving immutable snapshots of any orders already created under DB authority.

**Exit criterion:** Admin manages products in Supabase; checkout still derives every price/dimension from trusted server data; historical orders remain unchanged.

---

# PHASE 5 — Melhor Envio Shipments, Labels + Tracking

**Objective:** Extend existing quote-only Melhor Envio integration into a safe admin-controlled shipment lifecycle.

**Dependency:** Phase 2 order operations stable; Phase 4 shipping product metadata trusted; Phase 1 audit/events available.

**Detailed plan required:** `docs/superpowers/plans/2026-09-02-melhor-envio-shipments-labels.md`

### 5.1 Provider contract review gate

- [ ] Re-check current official Melhor Envio documentation immediately before implementation.
- [ ] Record exact current Sandbox/Production endpoints and OAuth scopes needed for calculate, cart/order preparation, checkout/purchase, generation, print, tracking, read, and cancellation.
- [ ] Request least privilege only; no unrelated company/user/product/coupon scopes.
- [ ] Update existing OAuth tests/docs to the exact approved scope set.
- [ ] Require explicit reauthorization flow when scope changes.

### 5.2 Shipment model

- [ ] Add dedicated `shipments` entity related to order.
- [ ] Persist provider/service/carrier IDs, provider shipment/order identifiers, purchased amount, label lifecycle, tracking code/state, operational timestamps, and safe metadata.
- [ ] Never persist access tokens in shipment rows.
- [ ] Design idempotency/uniqueness so accidental duplicate label purchase is prevented as far as provider contract permits.

### 5.3 Address safety

- [ ] Before label purchase, admin may correct address through explicit audited operation.
- [ ] Validate complete address/freight state before preparing/purchasing label.
- [ ] Once purchased, block silent address mutation that would diverge from active label.
- [ ] Address change after purchase requires cancel/recreate or documented provider-supported equivalent.

### 5.4 Admin shipment flow

- [ ] `ready_to_ship` order exposes explicit “Preparar envio”.
- [ ] Prepare provider cart/order without spending money.
- [ ] Display final provider shipment/service/cost before purchase.
- [ ] Require explicit confirmation to purchase label.
- [ ] Persist purchase result before any later optional generation/print step.
- [ ] Generate label explicitly/safely after confirmed purchase.
- [ ] Expose supported print/download operation to admin.
- [ ] Link tracking code/state to shipment and order timeline.
- [ ] Require strong confirmation for cancellation.

### 5.5 Tracking

- [ ] Allow safe read-only synchronization of tracking/provider state.
- [ ] Tracking failure surfaces retry/attention but does not alter financial state.
- [ ] Customer order view consumes sanitized tracking state after Phase 5 lands.
- [ ] Background tracking checks do not refresh the admin inactivity timer.

### 5.6 Sandbox acceptance

- [ ] OAuth reauthorization works in Sandbox with exact scopes.
- [ ] Freight calculate regression remains valid.
- [ ] Cart/prepare operation verified.
- [ ] Sandbox label purchase verified without double-purchase.
- [ ] Generation verified.
- [ ] Print/download verified.
- [ ] Tracking verified.
- [ ] Cancellation verified where Sandbox/provider supports it.
- [ ] Provider errors leave local state recoverable/auditable.
- [ ] `pnpm test` PASS.
- [ ] `pnpm typecheck` PASS.
- [ ] `pnpm build` PASS.
- [ ] Production provider rollout requires separate explicit owner approval because it can spend real balance.

**Phase 5 rollback:** Disable label-management admin actions and keep the existing freight-calculation path. Preserve already-confirmed shipment purchase records.

**Exit criterion:** Real shipment/label actions are explicit, idempotent as practical, auditable, address-safe, and independently recoverable from provider errors.

---

# PHASE 6 — Transactional Notification Outbox + Email

**Objective:** Send useful customer emails without allowing email-provider downtime to break payment, orders, or production operations.

**Dependency:** Phase 1 events; Phase 3 customer/email model; Phase 2 fulfillment events; Phase 5 tracking for shipment notices.

**Detailed plan required:** `docs/superpowers/plans/2026-09-02-transactional-notifications.md`

### 6.1 Delivery provider decision gate

- [ ] Select a Production-capable transactional email provider/SMTP mechanism before code implementation for this phase.
- [ ] Record API/runtime contract and retry limits in the phase plan.
- [ ] Store credentials only in runtime environment/secret configuration.
- [ ] Do not introduce marketing/newsletter scope.

### 6.2 Outbox/job model

- [ ] Add `notification_jobs` (or equivalent outbox) with event/template type, order/customer relationship, destination, status, attempt count, retry metadata, safe error summary, timestamps.
- [ ] Add uniqueness/idempotency policy preventing uncontrolled duplicate emails for the same domain event.
- [ ] Critical transactions enqueue work after/persistently alongside domain state without waiting for external email delivery.
- [ ] Worker/cron processor retries bounded transient failures safely.
- [ ] Permanent failure creates an operational attention signal without rolling back the order/payment state.

### 6.3 Transactional templates

- [ ] Account verification (through Supabase Auth mechanism as appropriate).
- [ ] Password reset (through Supabase Auth mechanism as appropriate).
- [ ] Order created.
- [ ] Payment approved.
- [ ] Production started.
- [ ] Ready to ship where useful.
- [ ] Shipped + tracking.
- [ ] Cancellation/refund where applicable.
- [ ] Templates contain only customer-safe data and direct the customer to the correct account/public order experience.

### 6.4 Admin visibility

- [ ] Order detail shows notification status/history.
- [ ] Admin sees safe failure summary and retry state, never provider credentials/raw sensitive response payloads.
- [ ] Optional manual retry action is explicit, authorized, rate-limited/idempotent.

### 6.5 Verification

- [ ] Email outage does not fail payment approval test.
- [ ] Duplicate event does not send uncontrolled duplicate notification.
- [ ] Retry behavior test.
- [ ] Sensitive-data redaction test.
- [ ] `pnpm test` PASS.
- [ ] `pnpm typecheck` PASS.
- [ ] `pnpm build` PASS.
- [ ] Preview delivery verified against non-Production/test destination strategy before enabling live emails.

**Phase 6 rollback:** Stop notification processor/feature while leaving queued records intact; checkout/payment/fulfillment continue independently.

**Exit criterion:** Transactional email is reliable enough to retry and observable enough to troubleshoot, but never part of critical payment success.

---

# PHASE 7 — Store Settings

**Objective:** Move approved commercial/operational settings out of code where useful without creating an infrastructure-secret editor.

**Dependency:** Phase 1 audit and Phase 4 catalog/settings patterns.

**Detailed plan required:** `docs/superpowers/plans/2026-09-02-store-settings.md`

### 7.1 Typed settings model

- [ ] Define a narrow allowlist of supported settings before schema implementation.
- [ ] Include only approved commercial/operational values such as default production lead time, public contact data, and selected customer-facing operational copy.
- [ ] Explicitly exclude all provider/auth/database secrets and immutable admin identity.
- [ ] Use typed validation/defaults rather than arbitrary JSON reads across the app.

### 7.2 Admin UI

- [ ] `/admin/configuracoes` follows current admin visual model.
- [ ] Explicit save operation.
- [ ] Confirmation for high-impact settings.
- [ ] Audit previous/new safe values.
- [ ] Clear validation messages without leaking internal configuration.

### 7.3 Consumer migration

- [ ] Move each approved code-owned setting to the typed setting reader one at a time.
- [ ] Preserve safe default/backward-compatible behavior during rollout.
- [ ] Avoid turning every storefront string into a database setting; YAGNI.

### 7.4 Verification

- [ ] Invalid setting values rejected server-side.
- [ ] Secret keys cannot be represented/read through settings model.
- [ ] Storefront/checkout regressions tested for each moved setting.
- [ ] `pnpm test` PASS.
- [ ] `pnpm typecheck` PASS.
- [ ] `pnpm build` PASS.
- [ ] Preview acceptance for customer-visible changed settings.

**Phase 7 rollback:** Restore code default/previous typed value without affecting orders or provider secrets.

**Exit criterion:** Useful operational settings are editable safely and auditable; infrastructure secrets remain outside the panel.

---

# PHASE 8 — Admin Dashboard Metrics + Attention Center

**Objective:** Turn `/admin` landing page into a useful operations summary based only on trustworthy persisted data.

**Dependency:** Phases 1, 2, 4, 5, and 6 provide stable data definitions.

**Detailed plan required:** `docs/superpowers/plans/2026-09-02-admin-dashboard-metrics.md`

### 8.1 Metric definitions

- [ ] Orders today/week/month.
- [ ] Approved payment value today/week/month.
- [ ] Awaiting production count.
- [ ] In production count.
- [ ] Ready to ship count.
- [ ] Shipped count.
- [ ] Orders requiring attention.
- [ ] Refund/chargeback/manual-review count.
- [ ] Product quantities sold using immutable order snapshots.
- [ ] Define timezone/date boundaries explicitly in phase plan so totals are deterministic.

### 8.2 Dashboard UI

- [ ] Replace/extend current `/admin` landing with operational cards while preserving integration navigation.
- [ ] Surface the most actionable queues first, not vanity graphs.
- [ ] Cards link to correctly filtered admin lists.
- [ ] Keep mobile layout concise and usable.
- [ ] Add trend graphs only if definitions are stable and the data improves decisions.

### 8.3 Query/performance

- [ ] Use bounded aggregate queries/indexes; do not load all orders to compute metrics in browser memory.
- [ ] Dashboard query failure must not break checkout or other admin pages.
- [ ] Background dashboard refresh must not keep admin inactivity alive unless user performs interactive activity.

### 8.4 Verification

- [ ] Aggregate unit/repository tests use fixed dates/timezones.
- [ ] Metric values match fixture orders/payment states.
- [ ] UI does not expose customer-sensitive detail unnecessarily.
- [ ] `pnpm test` PASS.
- [ ] `pnpm typecheck` PASS.
- [ ] `pnpm build` PASS.
- [ ] Preview manual dashboard review completed.

**Phase 8 rollback:** Restore simpler admin landing; all underlying operational modules remain usable directly.

**Exit criterion:** `/admin` answers “what needs my attention now?” without creating a new dependency for checkout.

---

# PHASE 9 — Cross-Module Hardening, Preview Acceptance + Production Rollout

**Objective:** Verify the complete expansion as one system, resolve integration risks, and prepare a controlled Production rollout.

**Dependency:** All intended feature phases implemented and individually verified.

**Detailed plan required:** `docs/superpowers/plans/2026-09-02-admin-expansion-hardening-rollout.md`

### 9.1 Security matrix

- [ ] Anonymous cannot access admin pages/APIs.
- [ ] AAL1 admin cannot access protected admin operations.
- [ ] Wrong authenticated Supabase UUID cannot access admin.
- [ ] Customer account cannot access any admin resource.
- [ ] Customer A cannot access Customer B account/order resources.
- [ ] Guest public-token access exposes only the approved customer-safe order view.
- [ ] CSRF/origin protections cover sensitive POST/PATCH/DELETE-style actions.
- [ ] Rate limiting covers auth-sensitive/abusable endpoints where needed.
- [ ] Audit/event payloads contain no secrets.
- [ ] Logs contain no credentials/auth cookies/payment secrets/raw provider tokens.
- [ ] Admin inactivity/single-session behavior remains intact across new routes/background polling.

### 9.2 Concurrency/idempotency matrix

- [ ] Duplicate Mercado Pago event cannot duplicate payment/fulfillment transition.
- [ ] Simultaneous fulfillment actions cannot create impossible state.
- [ ] Double product-save requests do not corrupt catalog state.
- [ ] Double claim operation cannot steal/reassign order.
- [ ] Double label purchase is blocked/idempotent as provider contract allows.
- [ ] Duplicate notification event cannot create uncontrolled repeated customer email.

### 9.3 Full regression

- [ ] Guest checkout end-to-end in Preview/Sandbox.
- [ ] Authenticated checkout end-to-end.
- [ ] Trusted product pricing from selected catalog authority.
- [ ] Freight quote unchanged/valid.
- [ ] Mercado Pago Sandbox/test payment transition.
- [ ] Customer account sees only owned order.
- [ ] Admin production transition and audit.
- [ ] Melhor Envio Sandbox label flow.
- [ ] Notification success/failure/retry.
- [ ] Settings effect and validation.
- [ ] Dashboard aggregates.
- [ ] Existing public order tracking.
- [ ] Existing admin login/MFA/logout/timeout/single-session.

### 9.4 Repository verification

- [ ] Focused phase tests all PASS.
- [ ] `pnpm test` PASS with zero failures.
- [ ] `pnpm typecheck` PASS.
- [ ] `pnpm build` PASS.
- [ ] GitHub CI on exact candidate commit PASS.

### 9.5 Preview manual acceptance

- [ ] Candidate Preview deployment READY.
- [ ] Owner manually reviews `/admin` navigation/dashboard.
- [ ] Owner manually reviews orders + production flow.
- [ ] Owner manually reviews customer account flow.
- [ ] Owner manually reviews products/admin editor.
- [ ] Owner manually reviews shipment/label flow using safe Sandbox/test context.
- [ ] Owner manually reviews responsive/mobile behavior.
- [ ] Runtime error/fatal logs reviewed for candidate Preview.
- [ ] Owner explicitly approves candidate for Production rollout.

### 9.6 Production rollout sequencing

- [ ] Re-read every migration and confirm compatibility with currently deployed code.
- [ ] Apply additive Production migrations in documented order only when approved.
- [ ] Deploy code in a sequence that tolerates both old/new schema during rollout.
- [ ] Keep guest checkout/public order tracking available throughout.
- [ ] Reauthorize Melhor Envio Production scopes only at the approved provider-rollout step.
- [ ] Enable real label purchase only after explicit owner confirmation.
- [ ] Enable live customer email delivery only after Production sender/runtime configuration verified.
- [ ] Switch trusted DB catalog authority only after Production data parity check and explicit approval.
- [ ] Monitor runtime errors and provider failures immediately after each high-risk enablement.

### 9.7 Merge / cleanup

- [ ] Do not merge `feat/admin-dashboard-expansion` without explicit owner permission.
- [ ] After merge, verify CI on `main` exact merge commit.
- [ ] Verify canonical Production deployment source SHA/state/aliases.
- [ ] Run production-safe smoke tests that do not create unnecessary real payments/labels.
- [ ] Update `CURRENT_STATUS.md` and this master plan with final evidence.
- [ ] Do not delete feature branch unless owner explicitly requests cleanup.

**Phase 9 rollback:** Roll back each optional authority/feature independently according to its phase strategy; never improvise a destructive schema rollback under pressure. Additive schema may remain while code rolls back.

**Exit criterion:** Complete expansion is owner-approved, verified on exact candidate, rolled out safely, and documented with final Production evidence.

---

# 10. Cross-phase data ownership map

Use this map to avoid accidental coupling.

| Domain | Authoritative source | Who may mutate | Important rule |
| --- | --- | --- | --- |
| Payment state | Mercado Pago + trusted webhook/RPC | Provider-driven server flow | Admin cannot force approved/refunded locally |
| Fulfillment state | `orders` operational field + explicit server operations | Authorized admin + approved-payment auto transition | Physical state independent from refund/chargeback |
| Order purchase snapshot | `orders.items` | Created by trusted checkout only | Historical snapshot does not follow catalog edits |
| Customer identity | Supabase Auth UUID | Customer auth flows/server | Name/email text is not relational identity |
| Customer profile | `customer_profiles` | Authorized customer/server + limited admin operational view | Minimal permanent data |
| Product authority | `products` after staged switch | Explicit admin product operations | Checkout reads trusted server source only |
| Shipment lifecycle | `shipments` + Melhor Envio provider state | Explicit admin/provider synchronization | Spending/cancel actions require confirmation |
| Order timeline | `order_events` | Domain services | Append-oriented; never fabricated |
| Admin audit | `admin_audit_log` | Authorized admin service operations | Append-only normal UI |
| Notifications | `notification_jobs`/outbox | Domain events + worker | Failure never rolls back payment/order |
| Store settings | typed `store_settings` | Authorized admin setting operations | No infrastructure secrets |

---

# 11. Required risk confirmations

The following actions are always treated as high risk and cannot be hidden behind a one-click accidental mobile interaction:

- cancel order;
- request/perform real provider refund when that feature is explicitly designed later;
- change customer delivery address after shipment purchase (must use cancel/recreate flow);
- purchase Melhor Envio label;
- cancel purchased label;
- deactivate product;
- materially change product price;
- change a high-impact global store setting;
- enable real Production provider behavior after Sandbox testing;
- switch trusted catalog authority in Production;
- merge/release the full expansion.

Each such action requires explicit authorization, server-side precondition checks, confirmation UX, and audit evidence where applicable.

---

# 12. Decisions future chats must not rediscover

1. Architecture is a modular monolith in the existing Next.js/Supabase app.
2. `/admin` remains the admin namespace; URL secrecy is not security.
3. Existing admin MFA/AAL2/single-session/30-minute inactivity rules remain mandatory.
4. Payment state is provider-authoritative and cannot be manually forced by admin writes.
5. Fulfillment is separate: `awaiting_payment -> awaiting_production -> in_production -> ready_to_ship -> shipped -> completed`; `canceled` is exceptional/terminal.
6. Only trusted approved payment automatically advances `awaiting_payment -> awaiting_production`.
7. Refund/chargeback adds attention and does not lie about physical state.
8. No generic admin PATCH for arbitrary order/payment fields.
9. Order events and admin audit are append-oriented and separate concepts.
10. Address may be corrected before label purchase; after purchase it cannot silently diverge from the active label.
11. Customer account is optional and uses email + permanent password + email verification + password reset.
12. Email is unique identity for login; names are not unique; internal ownership uses immutable customer UUID.
13. Guest checkout/public-token tracking remain supported.
14. Old/guest order claiming needs secure proof; never name match alone.
15. Customer profile stays minimal; payment cards are never stored.
16. Catalog moves to Supabase in stages; browser prices/dimensions are never trusted.
17. Historical order snapshots remain unchanged after catalog edits.
18. Label purchase is always explicit; payment approval never spends Melhor Envio balance automatically.
19. Melhor Envio scopes are verified against current official docs immediately before implementation and follow least privilege.
20. Tracking may synchronize automatically because it is read-only; failures do not alter finances.
21. Transactional email uses an outbox/job model and cannot block a legitimate payment/order transition.
22. Automated WhatsApp/provider messaging and marketing newsletters are out of scope; WhatsApp is a direct contact action initially.
23. Store settings contain commercial/operational values only; secrets remain runtime configuration.
24. Dashboard prioritizes actionable persisted metrics, not vanity graphs.
25. Migrations are compatibility-first and existing orders get no invented history.
26. `IMPLEMENTED`, `TESTED`, `PREVIEW APPROVED`, and `PRODUCTION APPROVED` are different states.
27. No merge/Production high-risk rollout without explicit owner approval.
28. No feature-branch deletion unless owner explicitly requests cleanup.

---

# 13. Current Session Checkpoint

**Status:** MASTER PLAN WRITTEN; IMPLEMENTATION NOT STARTED

**Current phase:** Phase 0 — Design and Master Planning

**Current task:** Master Plan created after owner approval of the written architecture.

**Branch:** `feat/admin-dashboard-expansion`

**Branch base:** `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`

**Approved spec:** `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`

**Implementation:** NOT STARTED

**Database migrations for this expansion:** NONE CREATED

**Production changes from this expansion:** NONE

**Verification for planning-only checkpoint:**

- spec content review: completed before Master Plan creation;
- runtime focused tests: not run — no runtime code changed in planning phase;
- `pnpm test`: not run — documentation-only planning checkpoint;
- `pnpm typecheck`: not run — documentation-only planning checkpoint;
- `pnpm build`: not run — documentation-only planning checkpoint.

**Preview:** Not required for documentation-only planning.

**Production:** NOT APPROVED / NOT CHANGED.

**Blockers:** None known for planning.

**NEXT EXACT ACTION:** Create `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md` from Phase 1 requirements, with exact SQL/file interfaces and TDD steps. Do not modify runtime code before that Phase 1 plan is written and reviewed.

**DO NOT REDISCOVER:** Read Section 12 above and the approved design before starting Phase 1. In particular, preserve provider-authoritative payment state, separate fulfillment, compatibility-first migrations, explicit admin operations, immutable order snapshots, and the no-Production-without-owner-approval rule.
