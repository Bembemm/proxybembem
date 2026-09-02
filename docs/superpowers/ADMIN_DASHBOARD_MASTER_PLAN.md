# ProxyBembem Admin Dashboard Expansion — Master Plan

> **Operational source of truth.** Read the approved design, this file, `docs/superpowers/CURRENT_STATUS.md`, then the active phase plan. Never equate IMPLEMENTED, TESTED, PREVIEW APPROVED, and PRODUCTION APPROVED.

**Goal:** expand the secure `/admin` into the operational store dashboard and add a customer account area without weakening the accepted checkout/payment/freight/admin-auth flows.

**Architecture:** modular monolith in the existing Next.js + Supabase app.

**Approved design:** `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`

**Working branch:** `feat/admin-dashboard-expansion`

**Branch base:** `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`

## Status semantics

- `[ ]` not started
- `[~]` in progress / evidence incomplete
- `[x]` complete with required evidence

No merge, new Production application deployment, catalog authority switch, real shipping-label spend, or other high-risk rollout occurs without explicit owner approval. Meaningful DDL on the existing Supabase project is applied only when needed and after explicit owner authorization.

## Global invariants

- [x] Keep `/admin`; URL secrecy is not a security boundary.
- [x] Admin security remains UUID allowlist + Supabase Auth + mandatory TOTP/AAL2 + one active server-side session + 30-minute inactivity + fail closed.
- [x] Customer authentication stays separate from admin authorization.
- [x] Mercado Pago remains payment authority; no local admin “mark paid/refunded”.
- [x] Fulfillment is separate from payment state.
- [x] Guest checkout/public-token tracking remain supported.
- [x] Browser price/shipping data is never trusted.
- [x] Historical `orders.items` remains immutable purchase truth.
- [x] Label purchase is never automatic after payment.
- [x] Secrets/tokens/password/TOTP/internal credentials never enter client responses, audit/events, docs, or commits.
- [x] Migrations are compatibility-first and do not fabricate historical facts.
- [x] Secondary-provider failures cannot corrupt critical payment/order state.
- [x] High-risk admin actions require explicit confirmation + server preconditions + audit.
- [x] Hosting migration is a separate project.
- [x] Do not introduce a paid Supabase development branch as a mandatory workflow; owner explicitly chose the existing in-place Supabase workflow used by this project.

---

# PHASE 0 — Design + Planning

**State:** COMPLETE.

- [x] Create `feat/admin-dashboard-expansion` from current main.
- [x] Write/approve architectural design.
- [x] Create Master Plan/checkpoint system.
- [x] Write/review Phase 1 detailed plan.
- [x] Phase 1 plan review fixed PostgREST dedupe, partial-index attention conflict handling, and recursive metadata-secret validation before runtime work.

---

# PHASE 1 — Data + Audit Foundation

**Plan:** `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md`

**State:** CODE TESTED + CURRENT SUPABASE MIGRATION APPLIED/VALIDATED. FEATURE BRANCH NOT MERGED. PREVIEW ADMIN ACCEPTANCE BLOCKED BY PREVIEW ENV CONFIG.

## Completed foundation

- [x] Add compatibility-safe `orders.fulfillment_status`.
- [x] Backfill approved -> `awaiting_production`; all other existing rows -> `awaiting_payment`; no fabricated events.
- [x] Add `order_events`.
- [x] Add `order_attention_flags`.
- [x] Add append-only `admin_audit_log`.
- [x] Browser roles blocked; required service-role privileges only.
- [x] Preserve Mercado Pago RPC input signature.
- [x] Trusted approval atomically performs only `awaiting_payment -> awaiting_production`.
- [x] Refund/chargeback preserves physical fulfillment and opens attention.
- [x] Amount/currency mismatch -> `manual_review` attention.
- [x] Add `fulfillment.ts`, `safe-metadata.ts`, `order-events.ts`, `order-attention.ts`, `admin-audit.ts`.
- [x] Branch `orders.ts` strictly parses new fulfillment result fields.
- [x] Verified service_role cannot UPDATE/DELETE `admin_audit_log` or `order_events`.

## TDD/CI evidence

- [x] Migration RED `bcebfdc71e28f7b54141e7f32a97f45c5782bb41`.
- [x] Migration GREEN `bdf02ffd76a3c63efd0fe617bada587965af7171`.
- [x] Fulfillment state machine RED -> GREEN `f880fa4a420932f6112cb3800ad86afdbb31f2ff`.
- [x] Payment contract RED `dbd2496fc4416fba374da9addc058d370f0a6b5e`.
- [x] Stabilized contract `1f1ba69dd61ed9c41d4abb4489f30d325a669be9` full CI PASS.
- [x] Order events GREEN `186d34d109c4bc6a41a02c7b8b172ae8838303e4` full CI PASS.
- [x] Attention RED `cadb3d30a46a1eea2d11ed9b43779a1fd9175abf`; GREEN `7ae5338b640f15f78554cb5c71ae5351643a5e3c` full CI PASS.
- [x] Audit RED `2b6af16a5362d8d7e8e75d3a5850ee9708ae1da6`; GREEN/code candidate `0ce3b371eda1cfccbd8ddde639b07e7b7ae57848` full CI PASS (`33590493640`).
- [x] Documentation checkpoint `11eb39252cb8c00cdc64336582b53e69b5fb10a6` also passed test/typecheck/build (`33590734705`).

## Supabase evidence

Owner explicitly authorized using the existing `ProxyBembem` project rather than creating a paid dev branch.

- [x] Apply `admin_order_operations_foundation`; Supabase recorded `20260902091641_admin_order_operations_foundation`.
- [x] Validate 25 existing orders; fulfillment NULLs 0; wrong approved backfill 0; wrong non-approved backfill 0.
- [x] Validate RLS/grants and payment-RPC execution grants.
- [x] Controlled transaction/rollback proves approval, replay idempotency, refund, chargeback, and manual-review behavior.
- [x] Validation leaves 0 persistent fixture orders.
- [x] Supabase advisor review completed; backend-only RLS/no-policy and fresh unused-index notices classified as intentional/expected; pre-existing leaked-password warning deferred to customer-auth hardening.

## Current app smoke after DB migration

- [x] Production `/admin` -> 200 login surface.
- [x] Production error/fatal logs during validation window -> none.
- [x] Production application code/deployment itself remains pre-expansion main.
- [~] Vercel Preview `/admin` -> 500 because Preview lacks `NEXT_PUBLIC_SUPABASE_URL`.
- [x] Preview root cause confirmed from runtime logs and documented.
- [ ] Configure complete Preview admin-auth env before any Preview approval.

---

# PHASE 2 — Admin Orders + Fulfillment

**Plan:** `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`

**State:** PLAN WRITTEN + SELF-REVIEWED. RUNTIME NOT STARTED.

## Planning gate

- [x] Inspect current admin shell/auth/integration route and Phase 1 repositories.
- [x] Write detailed Phase 2 implementation plan.
- [x] Self-review for TODO/TBD/placeholders: none.
- [x] Review fixes list RPC empty-page total by returning `{orders,total}`.
- [x] Review fixes admin date filtering to `America/Sao_Paulo` calendar boundaries.
- [x] Review defines literal escaping for search `%`, `_`, `\` and deterministic attention severity.
- [x] Review closes paid-cancellation lifecycle: `canceled_paid_order` opens without refund and resolves only after actual `refunded`/`charged_back` payment state; reversal-specific attention remains.
- [x] Review fixes one HTML-form result mapping; no alternate handler behavior left ambiguous.
- [x] Review explicitly handles Next.js 16 async dynamic params/searchParams.
- [x] Review preserves append-only audit/event privileges.

## Planned runtime work

- [~] Task 1: RED test for Phase 2 migration contract.
- [ ] Add static bounded `admin_list_orders` service-role-only RPC.
- [ ] Add atomic `admin_transition_order_fulfillment` RPC with row lock + event + audit + attention.
- [ ] Add reversal observer for cancellation-specific attention.
- [ ] Add backend-only admin read repository.
- [ ] Add strict fulfillment operation repository.
- [ ] Add five narrow same-origin POST routes with server-wired targets.
- [ ] Add shared current-style admin shell.
- [ ] Add `/admin/pedidos` server list/search/filter/pagination.
- [ ] Add `/admin/pedidos/[id]` operational detail/timeline/audit/actions.
- [ ] Add destructive cancellation confirmation.
- [ ] Add `/admin/producao` oldest-first active queues.
- [ ] Full focused tests + `pnpm test` + `pnpm typecheck` + `pnpm build` + exact diff/security review.
- [ ] STOP for owner approval before applying the exact Phase 2 migration to current Supabase.
- [ ] Transaction/rollback validate all transitions and leave 0 fixture rows.
- [ ] Fix Preview admin env and complete Preview smoke matrix.
- [ ] Separate owner approval before merge/new Production application deployment.

### Phase 2 transition truth

```text
awaiting_payment -> canceled
awaiting_production -> in_production | canceled
in_production -> ready_to_ship | canceled
ready_to_ship -> shipped | canceled
shipped -> completed
completed -> none
canceled -> none
```

Starting production requires `payment_status='approved'`.

Paid cancellation never changes payment state. It opens critical operational attention until a provider-confirmed reversal occurs.

---

# PHASE 3 — Customer Account + Owned Orders

**Future plan:** `docs/superpowers/plans/2026-09-02-customer-account-orders.md`

- [ ] Write/review detailed plan after Phase 2 acceptance.
- [ ] `customer_profiles` + nullable `orders.customer_id`.
- [ ] Email + permanent password + verification + reset.
- [ ] Unique normalized email; Auth UUID owns relationships.
- [ ] Guest checkout/public-token tracking remain.
- [ ] Secure guest/old-order claim; never name-only.
- [ ] `/minha-conta`, owned orders, profile/security, tracking and WhatsApp order contact.
- [ ] Cross-customer/takeover tests.

---

# PHASE 4 — Database Catalog + Admin Products

- [ ] Write/review detailed plan.
- [ ] Validated `products` table with integer-cent prices and shipping metadata.
- [ ] Seed exact current products and prove static/DB parity.
- [ ] `/admin/produtos` + explicit validated save + audit.
- [ ] Checkout remains server-authoritative.
- [ ] Historical snapshots remain unchanged.
- [ ] Staged authority switch with rollback.

---

# PHASE 5 — Melhor Envio Shipments + Labels + Tracking

- [ ] Write/review detailed plan and re-check current official API/scopes.
- [ ] Least-privilege OAuth expansion.
- [ ] Dedicated shipments model.
- [ ] Prepare -> review final cost -> explicit purchase -> generate/print -> track.
- [ ] No silent address divergence after label purchase.
- [ ] Sandbox acceptance before real balance capability.

---

# PHASE 6 — Transactional Notifications

- [ ] Write/review detailed plan.
- [ ] Choose Production-capable email mechanism with runtime-only credentials.
- [ ] Idempotent outbox/retries.
- [ ] Email failure never rolls back payment/order state.
- [ ] Account/order/payment/production/shipping/refund transactional notices.
- [ ] No marketing or automated WhatsApp provider initially.

---

# PHASE 7 — Store Settings

- [ ] Write/review detailed plan.
- [ ] Typed allowlist of safe commercial/operational settings.
- [ ] No provider/auth/database secrets in panel.
- [ ] `/admin/configuracoes` explicit save/validation/confirmation/audit.

---

# PHASE 8 — Dashboard Metrics + Attention Center

- [ ] Write/review detailed plan.
- [ ] Timezone-aware reliable order/approved-value metrics.
- [ ] Fulfillment/shipping/attention/refund/manual-review counts.
- [ ] Product quantities from immutable snapshots.
- [ ] Bounded server aggregates; actionable cards before vanity graphs.

---

# PHASE 9 — Hardening + Preview + Production Rollout

- [ ] Full authorization isolation matrix.
- [ ] CSRF/origin/rate-limit/log-secret checks.
- [ ] Concurrency/idempotency matrix across payment, fulfillment, account claim, labels, notifications.
- [ ] Full checkout/freight/payment/admin/customer/shipping/settings/metrics regressions.
- [ ] Exact candidate test/typecheck/build and CI PASS.
- [ ] Owner Preview acceptance.
- [ ] Explicit staged Production rollout approval.
- [ ] No merge without owner permission.
- [ ] Verify exact post-merge main CI/deployment SHA/aliases.
- [ ] Do not delete feature branch unless owner asks.

---

## Decisions future chats must not rediscover

1. Modular monolith; no microservices or giant generic mutation layer.
2. `/admin` stays readable; security is server auth + MFA, not obscurity.
3. Payment provider authoritative; fulfillment independent.
4. Trusted payment approval is the only automatic `awaiting_payment -> awaiting_production` transition.
5. Refund/chargeback never falsifies physical state.
6. No generic arbitrary admin order/payment PATCH.
7. Events and admin audit are separate append-oriented concepts.
8. Customer account is optional; guest checkout remains.
9. Catalog moves to Supabase in stages; browser price is never trusted.
10. Label spending is always explicit.
11. Notifications use outbox isolation.
12. Store settings contain no infrastructure secrets.
13. No fabricated historical events.
14. `IMPLEMENTED`, `TESTED`, `PREVIEW APPROVED`, `PRODUCTION APPROVED` stay distinct.
15. Existing Supabase project is intentionally evolved in place; paid dev branch is not a prerequisite.
16. Meaningful current-project DDL still stops for explicit owner approval.
17. Preview currently lacks required Supabase admin-auth env and is not approved.
18. Phase 2 list RPC returns `{orders,total}` even on an empty/out-of-range page.
19. Phase 2 admin date filters use `America/Sao_Paulo` day boundaries.
20. Paid cancellation does not refund; actual provider reversal resolves only the cancellation-specific alert.

## Current Session Checkpoint

**Status:** PHASE 1 VERIFIED; PHASE 2 PLAN REVIEWED; PHASE 2 TASK 1 RED NEXT; PREVIEW ADMIN ENV BLOCKER OPEN

**Current branch:** `feat/admin-dashboard-expansion`

**Phase 1 verified code candidate:** `0ce3b371eda1cfccbd8ddde639b07e7b7ae57848`

**Phase 1 Supabase migration:** applied/validated as `20260902091641_admin_order_operations_foundation`.

**Latest Phase 2 plan review commit:** `963c2d316451b62d43422d8685631a4cde33f177`.

**Preview:** not approved; protected route currently blocked by missing Preview `NEXT_PUBLIC_SUPABASE_URL`.

**Current Production app:** remains healthy after Phase 1 DB migration; no Phase 2 app code deployed.

**Phase 2 Supabase migration:** does not exist and has not been applied.

**Merge/new Production app deployment:** NOT APPROVED.

**NEXT EXACT ACTION:** create only `tests/admin-order-operations-migration.test.ts`, commit the RED, and confirm it fails solely because `supabase/migrations/202609020002_admin_order_fulfillment_operations.sql` does not exist. Do not write Phase 2 SQL before RED evidence.