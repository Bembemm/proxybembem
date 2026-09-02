# ProxyBembem Admin Dashboard Expansion — Master Plan

> **For agentic workers:** This is the operational source of truth for the admin-dashboard/customer-account expansion. Read the approved design, then this file, then the active phase plan. Never infer that code, Preview, or Production are approved merely because an earlier checkbox is complete.

**Goal:** Expand the secure `/admin` into a complete operational store dashboard and add an optional customer account area without weakening the Production-accepted checkout, Mercado Pago, Melhor Envio, Supabase, or admin-auth flows.

**Architecture:** Modular monolith in the existing Next.js + Supabase application. Payments, fulfillment, customers, catalog, shipments, notifications, settings, audit, and metrics have explicit data/service/authorization boundaries.

**Approved design:** `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`

**Working branch:** `feat/admin-dashboard-expansion`

**Branch base:** `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`

## Status semantics

- `[ ]` not started
- `[~]` in progress / evidence incomplete
- `[x]` complete with required evidence

Keep these states distinct: `IMPLEMENTED`, `TESTED`, `PREVIEW APPROVED`, `PRODUCTION APPROVED`.

No merge, Production migration, real shipping-label spending, catalog authority switch, or other high-risk Production action occurs without explicit owner approval.

## Global constraints

- [x] Keep `/admin`; URL secrecy is not a security boundary.
- [x] Preserve admin UUID + Supabase session + mandatory TOTP/AAL2 + active server-side admin session + 30-minute inactivity + fail-closed behavior.
- [x] Customer auth and admin authorization remain separate.
- [x] Mercado Pago/provider remains authoritative for payment status; admin cannot force financial state locally.
- [x] Fulfillment is independent from financial state.
- [x] Guest checkout and public-token tracking remain supported.
- [x] Browser-supplied price/shipping metadata is never trusted.
- [x] Historical `orders.items` remains immutable purchase truth.
- [x] Melhor Envio label purchase never happens automatically after payment.
- [x] Secrets/tokens/password/TOTP/internal credentials never enter client responses, audit/events, docs, or commits.
- [x] Migrations are compatibility-first/additive before hardening.
- [x] Existing orders receive no fabricated production/shipping history.
- [x] Secondary-provider failures cannot corrupt critical order/payment state.
- [x] High-risk actions require confirmation + server-side preconditions + audit where applicable.
- [x] Hosting migration remains a separate project.

---

# PHASE 0 — Design + Planning

- [x] Branch created from current `main`.
- [x] Architectural design written and owner-approved.
- [x] Master Plan created.
- [x] Phase 1 detailed plan written/reviewed: `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md`.
- [x] Phase 1 plan review fixed PostgREST dedupe targeting, partial-index attention handling, and recursive metadata-secret validation before runtime implementation.

**State:** COMPLETE.

---

# PHASE 1 — Data + Audit Foundation

**Detailed plan:** `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md`

**State:** IMPLEMENTED + TESTED on feature branch. NON-PRODUCTION DATABASE VALIDATION BLOCKED pending safe test environment. NOT PRODUCTION APPROVED.

## Schema/RPC

- [x] Add compatibility-safe nullable `orders.fulfillment_status` with default `awaiting_payment`.
- [x] Conservative migration backfill: approved -> `awaiting_production`; all other known rows -> `awaiting_payment`; no historical event fabrication.
- [x] Add `order_events` append-oriented lifecycle history.
- [x] Add `order_attention_flags` supporting independent active attention conditions.
- [x] Add append-only `admin_audit_log`.
- [x] Enable RLS/revoke browser roles and grant only required service-role privileges.
- [x] Preserve the existing `apply_mercadopago_payment_event` input signature.
- [x] Approved payment atomically performs only `awaiting_payment -> awaiting_production`.
- [x] Duplicate provider events use event dedupe keys.
- [x] Refund/chargeback does not rewind physical fulfillment and opens critical attention.
- [x] Amount/currency mismatch opens `payment_manual_review` attention.

## Server foundations

- [x] `lib/server/fulfillment.ts` defines stable fulfillment vocabulary and admin transition rules.
- [x] `lib/server/safe-metadata.ts` recursively rejects secret-like/internal metadata, cycles, non-JSON values, excessive depth, and oversized payloads.
- [x] `lib/server/order-events.ts` uses explicit `on_conflict=dedupe_key` only when dedupe is requested.
- [x] `lib/server/order-attention.ts` does not fake a partial-index upsert; only named `23505` conflict `order_attention_active_code_uidx` is treated as idempotent.
- [x] `lib/server/admin-audit.ts` exposes append/list only; no update/delete API.
- [x] `lib/server/orders.ts` strictly parses `fulfillment_status` and `fulfillment_transitioned` while keeping the RPC input body unchanged.

## TDD evidence

- [x] Migration RED: commit `bcebfdc71e28f7b54141e7f32a97f45c5782bb41`; 3/3 failed for expected missing migration.
- [x] Migration GREEN: commit `bdf02ffd76a3c63efd0fe617bada587965af7171`; CI run `33589364422` passed test/typecheck/build.
- [x] Fulfillment state machine completed RED -> GREEN; commit `f880fa4a420932f6112cb3800ad86afdbb31f2ff`.
- [x] Payment result contract RED: commit `dbd2496fc4416fba374da9addc058d370f0a6b5e`; expected rejection test initially failed.
- [x] Contract implementation plus fixture-debugging converged on commit `1f1ba69dd61ed9c41d4abb4489f30d325a669be9`; CI `33590010500` passed test/typecheck/build.
- [x] Recursive safe metadata completed RED -> GREEN.
- [x] Order events completed RED -> GREEN; commit `186d34d109c4bc6a41a02c7b8b172ae8838303e4`; CI `33590203413` passed test/typecheck/build.
- [x] Order attention RED: commit `cadb3d30a46a1eea2d11ed9b43779a1fd9175abf`; 242 pass / 1 expected missing-module fail.
- [x] Order attention GREEN: commit `7ae5338b640f15f78554cb5c71ae5351643a5e3c`; CI `33590348271` passed test/typecheck/build.
- [x] Admin audit RED: commit `2b6af16a5362d8d7e8e75d3a5850ee9708ae1da6`; 248 pass / 1 expected missing-module fail.
- [x] Admin audit GREEN/current code candidate: `0ce3b371eda1cfccbd8ddde639b07e7b7ae57848`; CI `33590493640`, job `100123329614`, passed `pnpm test`, `pnpm typecheck`, and `pnpm build`.

## Systematic-debugging record

Two failures after extending `OrderRecord`/payment RPC were traced to stale test fixtures, not runtime webhook behavior:

- `tests/webhook-route.test.ts` mocked the old RPC response; fixture updated only.
- `tests/order-display.test.ts` built a full `OrderRecord` without `fulfillment_status`; fixture updated only.

No production webhook logic changed to hide those failures.

## Scope review

Comparison `b7172e86... -> 0ce3b371...` is 22 commits ahead and changes only the approved planning docs, one additive Phase 1 migration, fulfillment/metadata/event/attention/audit server modules, the narrow `orders.ts` contract update, and relevant tests/fixtures. No storefront, catalog authority, hosting, shipping-label flow, customer-account UI, or admin UI changes are part of this candidate.

## Database/Preview validation gate

- [ ] Apply migration to a clearly non-Production Supabase environment.
- [ ] Validate conservative backfill and default behavior without exposing PII.
- [ ] Validate upgraded payment RPC cases in non-Production.
- [ ] Validate no retroactive `order_events` were created.
- [ ] Validate RLS/grants on new internal tables.
- [ ] Deploy the matching code candidate to Preview after DB migration succeeds.
- [ ] Smoke existing checkout/public-order/admin-auth behavior.
- [ ] Review Preview runtime errors.
- [ ] Obtain explicit owner approval before Production migration/deploy.

**Environment discovery on 2026-09-02:** connected Supabase exposes one project named `ProxyBembem` (`sa-east-1`) and `list_branches` returned no development branches. Therefore no SQL was applied. Creating a Supabase development branch may incur a cost and requires an explicit organization/cost confirmation workflow.

**Rollback:** Additive Phase 1 schema may remain while code rolls back; never delete current checkout/payment data as rollback.

**NEXT EXACT ACTION:** owner decides whether to create a Supabase development branch for safe Phase 1 DB validation. If yes, confirm which Supabase organization to use, query the branch cost, show that cost to the owner, obtain cost confirmation, then create the branch. Do not use the sole existing `ProxyBembem` project for Phase 1 validation without explicit Production authorization.

---

# PHASE 2 — Admin Orders + Fulfillment

**Plan:** `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md` (create only after Phase 1 acceptance).

- [ ] `/admin/pedidos` server-side list/search/filter.
- [ ] `/admin/pedidos/[id]` complete operational detail.
- [ ] `/admin/producao` production queues.
- [ ] Explicit start/ready/shipped/completed/cancel operations with authorization, transition validation, event + audit.
- [ ] No arbitrary payment mutation.
- [ ] Mobile-safe current admin visual model.
- [ ] Focused auth/transition/UI tests + full CI + owner Preview approval.

---

# PHASE 3 — Customer Account + Owned Orders

- [ ] `customer_profiles` + nullable `orders.customer_id`.
- [ ] Email + permanent password + verification + password reset.
- [ ] Email unique/case-insensitive; names may repeat; Auth UUID owns relationships.
- [ ] Guest checkout/public-token tracking remain.
- [ ] Secure old/guest order claim; never name-only.
- [ ] `/minha-conta`, owned orders, profile/security and WhatsApp order-contact action.
- [ ] Cross-customer isolation/takeover regression tests.

---

# PHASE 4 — Database Catalog + Admin Products

- [ ] Validated `products` table with integer-cent prices and shipping metadata.
- [ ] Seed exact current products.
- [ ] DB/static parity tests before authority switch.
- [ ] `/admin/produtos` + safe product editor with explicit save/confirmation/audit.
- [ ] Checkout always reads trusted server authority; historical order snapshots immutable.
- [ ] Static authority removed only after staged Preview/rollback validation.

---

# PHASE 5 — Melhor Envio Shipments + Labels + Tracking

- [ ] Verify current official API/scopes immediately before implementation.
- [ ] Least-privilege OAuth expansion only.
- [ ] Dedicated `shipments` model.
- [ ] Prepare -> review final cost -> explicit label purchase -> generate/print -> tracking.
- [ ] Address cannot silently diverge after label purchase.
- [ ] Read-only tracking may sync automatically.
- [ ] Sandbox acceptance before any real-balance capability.

---

# PHASE 6 — Transactional Notifications

- [ ] Production-capable email mechanism chosen with runtime-only credentials.
- [ ] Idempotent outbox/jobs and bounded retries.
- [ ] Email failure never rolls back payment/order state.
- [ ] Transactional account/order/payment/production/shipping/refund notices.
- [ ] No newsletter or automated WhatsApp provider scope initially.

---

# PHASE 7 — Store Settings

- [ ] Typed allowlist of safe commercial/operational settings.
- [ ] No provider/auth/database secrets in panel.
- [ ] `/admin/configuracoes` explicit save/validation/confirmation/audit.

---

# PHASE 8 — Dashboard Metrics + Attention Center

- [ ] Stable timezone-aware metrics for orders/approved value.
- [ ] Production/shipping/attention/refund/manual-review counts.
- [ ] Product quantities sold from immutable snapshots.
- [ ] Bounded server aggregate queries; actionable cards before vanity graphs.

---

# PHASE 9 — Hardening + Preview + Production Rollout

- [ ] Full anonymous/AAL1/wrong-admin/customer/cross-customer authorization matrix.
- [ ] CSRF/origin/rate-limit/sensitive-log checks.
- [ ] Concurrency/idempotency matrix across payment, fulfillment, claim, labels and notifications.
- [ ] Full guest/authenticated checkout, payment, freight, admin, customer, shipment, notifications, settings and metrics regression.
- [ ] Exact candidate `pnpm test`, `pnpm typecheck`, `pnpm build`, GitHub CI PASS.
- [ ] Owner manually approves Preview.
- [ ] Compatibility-safe Production rollout in explicit stages.
- [ ] No merge without explicit owner permission.
- [ ] After merge verify exact `main` CI/deployment SHA and canonical aliases.
- [ ] Do not delete feature branch unless owner asks.

## Decisions future chats must not rediscover

1. Modular monolith, no generic giant dashboard and no microservices.
2. `/admin` remains; real protection is server authorization + MFA.
3. Payment provider-authoritative; fulfillment independent.
4. Automatic fulfillment only on trusted approved payment from `awaiting_payment`.
5. Refund/chargeback creates attention without falsifying physical state.
6. No generic admin PATCH for arbitrary order/payment fields.
7. Events and admin audit are separate append-oriented concepts.
8. Customer account optional; email/password/verification/reset; Auth UUID is ownership identity.
9. Guest checkout/public tracking remain.
10. Catalog migrates to Supabase in stages; browser prices are never trusted.
11. Label purchase is always explicit and never automatic after payment.
12. Notifications use outbox isolation.
13. Settings contain no infrastructure secrets.
14. Migrations compatibility-first; no invented historical events.
15. `IMPLEMENTED`, `TESTED`, `PREVIEW APPROVED`, `PRODUCTION APPROVED` remain separate.
16. Sole connected Supabase project currently has no development branch; do not treat it as a test DB.

## Current Session Checkpoint

**Status:** PHASE 1 CODE VERIFIED; NON-PRODUCTION DATABASE VALIDATION BLOCKED BY ENVIRONMENT

**Current branch:** `feat/admin-dashboard-expansion`

**Verified code candidate:** `0ce3b371eda1cfccbd8ddde639b07e7b7ae57848`

**Exact CI:** run `33590493640`, job `100123329614` — test/typecheck/build PASS.

**Expansion migration applied:** NO.

**Preview:** not validated yet because the matching database migration has not been applied to a safe non-Production environment.

**Production:** unchanged / NOT APPROVED for this expansion.

**Blocker:** only one connected Supabase project exists and it has zero development branches.

**NEXT EXACT ACTION:** ask owner whether to create a paid/free-as-reported-by-Supabase development branch; before creation, confirm organization and show the current Supabase branch cost using the required cost-confirmation flow.
