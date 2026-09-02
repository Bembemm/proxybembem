# ProxyBembem Admin Dashboard Expansion — Master Plan

> **Operational source of truth.** Read the approved design, this file, `docs/superpowers/CURRENT_STATUS.md`, then the active phase plan. Never equate IMPLEMENTED, TESTED, PREVIEW APPROVED, DB APPLIED, MERGED, and PRODUCTION APPROVED.

**Goal:** expand the secure `/admin` into the operational store dashboard and add a customer account area without weakening checkout/payment/freight/admin-auth.

**Architecture:** modular monolith in the existing Next.js + Supabase app.

**Approved design:** `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`

**Working branch:** `feat/admin-dashboard-expansion`

**Branch base:** `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`

## Status semantics

- `[ ]` not started
- `[~]` in progress / evidence incomplete
- `[x]` complete with required evidence

No merge, new Production application deployment, catalog authority switch, real label spend, or other high-risk rollout occurs without explicit owner approval. Meaningful DDL on the existing Supabase project is applied only when needed and after explicit owner authorization.

## Global invariants

- [x] Keep `/admin`; URL secrecy is not a security boundary.
- [x] Admin security remains immutable UUID allowlist + Supabase Auth + mandatory TOTP/AAL2 + one active server-side session + inactivity expiry + fail closed.
- [x] Customer authentication stays separate from admin authorization.
- [x] Mercado Pago remains payment authority; no local admin/customer “mark paid/refunded”.
- [x] Fulfillment remains independent from payment state.
- [x] Guest checkout and `/pedido/[token]` tracking remain supported.
- [x] Browser price/shipping/customer ownership identifiers are never trusted.
- [x] Historical `orders.items` remains immutable purchase truth.
- [x] Label purchase is never automatic after payment.
- [x] Secrets/tokens/password/TOTP/internal credentials never enter client responses, audit/events, docs, or commits.
- [x] Migrations are compatibility-first and do not fabricate historical facts.
- [x] Existing Supabase project is intentionally evolved in place; paid dev branch is not a prerequisite.
- [x] Meaningful current-project DDL stops for explicit owner approval.

---

# PHASE 0 — Design + Planning

**State:** COMPLETE.

- [x] Create `feat/admin-dashboard-expansion` from accepted main.
- [x] Approve modular-monolith design.
- [x] Create Master Plan + CURRENT_STATUS checkpoint system.
- [x] Define security/payment/fulfillment/customer/catalog/shipping/notification boundaries.

---

# PHASE 1 — Data + Audit Foundation

**Plan:** `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md`

**State:** COMPLETE — CODE VERIFIED + MIGRATION APPLIED/VALIDATED. FEATURE BRANCH NOT MERGED.

- [x] Add compatibility-safe `orders.fulfillment_status`.
- [x] Backfill approved -> `awaiting_production`, others -> `awaiting_payment`, with no fabricated history.
- [x] Add `order_events`, `order_attention_flags`, append-only `admin_audit_log`.
- [x] Preserve Mercado Pago RPC financial integrity and automatic approved-payment transition only.
- [x] Browser roles blocked; service-role privileges narrowed.
- [x] Refund/chargeback preserves physical fulfillment and opens attention.
- [x] Apply migration after owner approval and transaction-test real DB paths.
- [x] Zero synthetic fixtures remain.

Primary Phase 1 runtime candidate: `0ce3b371eda1cfccbd8ddde639b07e7b7ae57848`, CI `33590493640` PASS.

---

# PHASE 2 — Admin Orders + Fulfillment

**Plan:** `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`

**State:** COMPLETE — CODE/TDD/SECURITY/SCOPE/DB/PREVIEW VERIFIED. FEATURE BRANCH NOT MERGED. NEW PRODUCTION APP DEPLOYMENT NOT APPROVED.

Final reviewed runtime candidate: `abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7`.

CI `33650730746`, job `100316764581`: `pnpm test`, `pnpm typecheck`, `pnpm build` PASS; workflow SUCCESS.

Applied migration: `20260902160658_admin_order_fulfillment_operations`.

- [x] Structural DB validation PASS.
- [x] Controlled rollback matrix 16/16 PASS.
- [x] Zero orders/events/attention/audit fixtures remained.
- [x] `/admin/pedidos`, `/admin/pedidos/[id]`, `/admin/producao` implemented.
- [x] Five narrow same-origin/AAL2 fulfillment POST actions implemented.
- [x] Cancellation requires explicit confirmation and never changes Mercado Pago state.
- [x] Shared protected admin shell/navigation implemented.
- [x] Exact diff/security/concurrency review PASS.
- [x] Automated Preview smoke PASS.
- [x] Owner authenticated with password + TOTP; protected Preview smoke passed 5/5.
- [x] Checked Preview logs contained no `error`/`fatal` entries.

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

---

# PHASE 3 — Customer Account + Owned Orders

**Plan:** `docs/superpowers/plans/2026-09-02-customer-account-orders.md`

**State:** TASK 1 MIGRATION CONTRACT RED VALID; TASK 2 GREEN MIGRATION NEXT. PHASE 3 DDL NOT APPLIED.

Initial Phase 3 plan commit: `f36350f861e4dc8c3b8206f38a75e5bc4350b8f8`.

## Owner-approved Phase 3 decisions

- [x] **Email is mandatory for every new checkout, including guest checkout.**
- [x] Account creation remains optional; guest checkout remains supported.
- [x] Supabase Auth email is the unique account identity; names may duplicate.
- [x] New orders persist normalized lowercase `customer_email` snapshot.
- [x] Existing historical orders receive no fabricated email/customer ownership; new columns remain `NULL` for old orders unless future truth is established explicitly.
- [x] Authenticated checkout links to trusted server-resolved Supabase Auth UUID `customer_id`; browser never supplies trusted customer UUID.
- [x] Authenticated checkout uses canonical account email; mismatching form email is rejected.
- [x] Permanent `customer_profiles` stays minimal: Auth UUID, name, WhatsApp, timestamps. Email remains authoritative in Supabase Auth.
- [x] Customer authorization is separate from admin authorization.
- [x] Customer order reads use narrow safe RPCs based on `auth.uid()`; no broad browser SELECT on `orders`.
- [x] Guest-order claiming requires **verified account email + possession of the existing secure public order token**.
- [x] Email-only, name-only, WhatsApp-only, order-number-only and bulk automatic claim are forbidden.
- [x] Historical orders with `customer_email IS NULL` remain public-token-trackable but are not claimable in Phase 3.
- [x] Existing `/pedido/[token]` remains valid even after account linking.
- [x] Customer DTOs exclude public token, checkout attempt/fingerprint/URL, raw shipping snapshot, admin audit, payment/provider secrets/internal data.
- [x] Phase 3 uses Supabase Auth verification/recovery emails only; transactional order-status email remains Phase 6.

## Planned Phase 3 database contract

Migration filename:

`supabase/migrations/202609020003_customer_accounts_orders.sql`

**Current state:** file does not exist yet and no Phase 3 DDL has been applied.

Planned additive objects:

- nullable `orders.customer_email` with normalized/validated storage rules;
- nullable `orders.customer_id uuid -> auth.users(id)`;
- indexed customer ownership;
- RLS-backed `customer_profiles`;
- authenticated `customer_list_orders(...) -> jsonb` using `auth.uid()`;
- authenticated `customer_get_order(...) -> jsonb` using `auth.uid()` and curated customer-safe timeline;
- service-role-only `claim_guest_order_for_customer(...) -> jsonb` with row lock, verified-email + token checks, and idempotent `customer_order_claimed` event.

## Planned customer routes

- `/entrar`
- `/criar-conta`
- `/esqueci-a-senha`
- `/auth/callback`
- `/minha-conta`
- `/minha-conta/pedidos`
- `/minha-conta/pedidos/[id]`
- `/minha-conta/perfil`
- `/minha-conta/seguranca`

Customer UI uses storefront visual identity, not admin styling.

## Phase 3 execution tasks

- [x] Task 1 — migration contract RED only.
- [ ] Task 2 — additive customer/account migration GREEN in Git; do not apply DB yet.
- [ ] Task 3 — mandatory checkout email RED/GREEN.
- [ ] Task 4 — trusted customer auth boundary.
- [ ] Task 5 — authenticated checkout ownership persistence + safe admin email display.
- [ ] Task 6 — RLS-backed minimal customer profile repository.
- [ ] Task 7 — signup/login/logout/email verification/password recovery/profile actions + bounded rate limits + SSR cookie matcher.
- [ ] Task 8 — customer-owned order list/detail repository.
- [ ] Task 9 — secure verified-email + token guest claim.
- [ ] Task 10 — storefront-styled customer account UI.
- [ ] Task 11 — customer A/B isolation/account-takeover negative matrix.
- [ ] Task 12 — exact full candidate test/typecheck/build + diff/security review.
- [ ] Task 13 — explicit owner gate before applying exact Phase 3 migration to current Supabase; rollback-only DB validation and zero fixtures.
- [ ] Task 14 — Preview acceptance with real verification/login and cross-account isolation checks.
- [ ] Task 15 — Phase 3 completion gate.

## Task 1 — RED evidence

Test-only file: `tests/customer-account-migration.test.ts`.

RED commit: `631565b4e2319b697db2ce42487a462ef4d333f2`.

CI run `33666326422`, job `100368874030`:

- [x] `pnpm test` failed as expected.
- [x] 295 total tests; 291 PASS; exactly 4 FAIL.
- [x] All four failures are new Phase 3 migration-contract tests.
- [x] Every failure is `ENOENT` for `supabase/migrations/202609020003_customer_accounts_orders.sql`.
- [x] No unrelated test failed.
- [x] `pnpm typecheck` and `pnpm build` were skipped because expected RED stopped the job; do not treat this commit as a full verification candidate.
- [x] No Phase 3 SQL existed when RED was captured.

The RED contract requires additive nullable ownership/email fields, no historical identity backfill, own-row RLS profile data, customer list/detail RPC ownership via `auth.uid()`, no broad authenticated order access, and service-role-only locked verified-email + token claim. Existing `order_events.source` already accepts `customer`.

## Phase 3 TDD/rollout gates

- [x] Task 1 has valid RED before SQL.
- [ ] Every later runtime unit RED before GREEN.
- [ ] Full `pnpm test`, `pnpm typecheck`, `pnpm build` on exact candidate.
- [ ] No broad order/customer ownership mutation API.
- [ ] Customer A cannot access B by copied/guessed order UUID.
- [ ] Public token never appears in customer account DTOs.
- [ ] Guest claim does not exist without both verified identity and token possession.
- [ ] Admin UUID/AAL2/session boundary unchanged.
- [ ] Mercado Pago financial state untouched.
- [ ] Phase 3 DDL is not applied until full candidate review + explicit owner approval.
- [ ] No merge/new Production application deployment without separate explicit owner approval.

---

# PHASE 4 — Database Catalog + Admin Products

- [ ] Validated `products` table with integer-cent prices and shipping metadata.
- [ ] Seed exact current products and prove static/DB parity.
- [ ] `/admin/produtos` + explicit validated save + audit.
- [ ] Stable product ID is not editable.
- [ ] Checkout remains server-authoritative; historical snapshots remain immutable.
- [ ] Soft deactivate/archive; no hard delete.
- [ ] Staged authority switch with rollback.

---

# PHASE 5 — Melhor Envio Shipments + Labels + Tracking

- [ ] Re-check current official API/scopes immediately before implementation.
- [ ] Least-privilege OAuth expansion + explicit reauthorization only when required.
- [ ] Dedicated shipment model with idempotency/snapshots.
- [ ] Flow: ready -> review -> prepare -> show final cost -> explicit buy -> generate/print/download -> tracking.
- [ ] Never auto-buy label after payment.
- [ ] Cancel/spend actions require explicit confirmation.
- [ ] Address correction audited; after label purchase require cancel/recreate rather than silent mutation.
- [ ] Sandbox acceptance before real balance spending capability.

---

# PHASE 6 — Transactional Notifications

- [ ] Production-capable email mechanism with runtime-only credentials.
- [ ] Outbox/jobs with dedupe and retry.
- [ ] Email failure never rolls back payment/order state.
- [ ] Order created/payment approved/production/ready/shipped/cancel/refund notices.
- [ ] No marketing and no automated WhatsApp in first phase.
- [ ] Admin can see delivery status/failures.

---

# PHASE 7 — Store Settings

- [ ] Typed safe allowlist only.
- [ ] Operational/commercial settings, never infrastructure secrets.
- [ ] `/admin/configuracoes` explicit save/validation/confirmation/audit.
- [ ] Secrets remain env-only.

---

# PHASE 8 — Dashboard Metrics + Attention Center

- [ ] Reliable DB-derived metrics with timezone-aware boundaries.
- [ ] Orders today/week/month, approved value, production queues, shipped, attention, refunds/chargebacks and products sold.
- [ ] Product quantities derive from immutable order snapshots.
- [ ] Bounded server aggregates; no fake metrics.
- [ ] Trend graphs only after trustworthy aggregates exist.

---

# PHASE 9 — Hardening + Preview + Production Rollout

- [ ] Full authorization isolation matrix.
- [ ] CSRF/origin/rate-limit/log-secret checks.
- [ ] Concurrency/idempotency matrix.
- [ ] Full regression suite.
- [ ] Exact candidate test/typecheck/build + CI PASS.
- [ ] Owner Preview acceptance.
- [ ] Explicit staged Production rollout approval.
- [ ] No merge without owner permission.
- [ ] Verify exact post-merge main CI/deployment SHA/aliases.
- [ ] Do not delete feature branch unless owner asks.

---

## Decisions future chats must not rediscover

1. Architecture is a modular monolith.
2. `/admin` security is authorization/MFA, not URL obscurity.
3. Mercado Pago remains payment authority; fulfillment is independent.
4. Trusted payment approval is the only automatic `awaiting_payment -> awaiting_production` transition.
5. Refund/chargeback never falsifies physical fulfillment.
6. No generic arbitrary admin order/payment PATCH.
7. Guest checkout remains supported even after customer accounts exist.
8. **Email is required for every new checkout, including guests.**
9. Supabase Auth UUID is customer ownership identity; browser never chooses `customer_id`.
10. Historical orders do not get fabricated email/customer ownership.
11. Guest-order claim requires verified email + secure public token; email-only claim is forbidden.
12. Historical null-email orders stay public-token-only in Phase 3.
13. Customer order RPCs derive ownership from `auth.uid()` and return curated safe DTOs.
14. Customer auth and admin auth are separate boundaries.
15. Catalog moves to Supabase only in Phase 4 and in stages; browser price never trusted.
16. Label spending is always explicit and remains Phase 5.
17. Transactional order notifications use isolated outbox later; Phase 3 only relies on Supabase Auth verification/recovery mail.
18. Existing Supabase project is evolved in place; paid dev branch is not required.
19. Meaningful DDL requires owner approval.
20. Phase 2 migration `20260902160658_admin_order_fulfillment_operations` is already applied/validated; do not reapply it.
21. Phase 2 rollback matrix passed 16/16 and left zero fixtures.
22. Phase 2 Preview authenticated owner smoke passed 5/5 with zero checked error/fatal logs.
23. Phase 3 Task 1 RED is valid at `631565b4...`, CI `33666326422`: 295 total, 291 pass, 4 expected ENOENT failures; typecheck/build skipped.
24. Phase 3 migration has not been created/applied yet; Task 2 GREEN is next.

## Current Session Checkpoint

**Status:** PHASE 1 COMPLETE/APPLIED; PHASE 2 COMPLETE/APPLIED/PREVIEW ACCEPTED; PHASE 3 TASK 1 RED VALID; TASK 2 NEXT.

**Current branch:** `feat/admin-dashboard-expansion`.

**Phase 2 final runtime candidate:** `abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7`, CI `33650730746` PASS.

**Phase 3 plan:** `docs/superpowers/plans/2026-09-02-customer-account-orders.md`.

**Task 1 RED:** `631565b4e2319b697db2ce42487a462ef4d333f2`, CI `33666326422`, job `100368874030`, valid expected failure.

**Phase 3 DB:** NOT CREATED / NOT APPLIED.

**Merge/new Production application deployment:** NOT APPROVED.

**NEXT EXACT ACTION:** implement only Task 2 by creating `supabase/migrations/202609020003_customer_accounts_orders.sql`, then run the focused migration test and Phase 1/2 migration/payment regressions. Keep SQL Git-only; do not apply to Supabase. If GREEN does not close, debug before Task 3.
