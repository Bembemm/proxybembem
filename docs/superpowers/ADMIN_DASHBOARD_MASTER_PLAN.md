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

**State:** TASKS 1-12 COMPLETE/REVIEWED. EXACT PHASE 3 DDL EXISTS IN GIT BUT IS NOT APPLIED. TASK 13 OWNER APPROVAL GATE NEXT.

Initial Phase 3 plan commit: `f36350f861e4dc8c3b8206f38a75e5bc4350b8f8`.

Reviewed runtime candidate: `1f2432bd000e7e01201d0f2d632cac51399f86d0`.

Reviewed candidate CI: `33684404621`, job `100428283809`: **359/359 tests PASS, typecheck PASS, build PASS, 28/28 static pages generated**.

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

## Phase 3 database contract

Migration filename: `supabase/migrations/202609020003_customer_accounts_orders.sql`.

**Current state:** migration exists in Git, has passed contract tests and Task 12 review, and is **NOT APPLIED** to Supabase. Application is Task 13 and requires explicit owner approval.

Reviewed additive objects:

- nullable normalized `orders.customer_email`;
- nullable `orders.customer_id uuid -> auth.users(id)`;
- indexed customer ownership;
- RLS-backed `customer_profiles`, authenticated own-row SELECT/INSERT/UPDATE only, no DELETE;
- authenticated `customer_list_orders(...) -> jsonb` using `auth.uid()` and curated summary only;
- authenticated `customer_get_order(...) -> jsonb` using `auth.uid()`, null for missing/not-owned, curated customer-safe timeline;
- service-role-only `claim_guest_order_for_customer(...) -> jsonb` with verified Auth email + public token, `FOR UPDATE`, generic non-claimable behavior and idempotent `customer_order_claimed` event;
- no historical email/customer ownership backfill.

`order_events.source='customer'` is compatible with the already-applied Phase 1 source constraint.

## Customer routes implemented in reviewed candidate

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
- [x] Task 2 — additive customer/account migration GREEN in Git; DB kept unapplied.
- [x] Task 3 — mandatory checkout email RED/GREEN.
- [x] Task 4 — trusted customer auth boundary.
- [x] Task 5 — authenticated checkout ownership persistence + safe admin email display.
- [x] Task 6 — RLS-backed minimal customer profile repository.
- [x] Task 7 — signup/login/logout/email verification/password recovery/profile actions + bounded rate limits + SSR cookie matcher.
- [x] Task 8 — customer-owned order list/detail repository.
- [x] Task 9 — secure verified-email + token guest claim.
- [x] Task 10 — storefront-styled customer account UI.
- [x] Task 11 — customer A/B isolation/account-takeover negative matrix.
- [x] Task 12 — exact full candidate test/typecheck/build + diff/security review.
- [ ] Task 13 — explicit owner gate before applying exact Phase 3 migration to current Supabase; rollback-only DB validation and zero fixtures.
- [ ] Task 14 — Preview acceptance with real verification/login and cross-account isolation checks.
- [ ] Task 15 — Phase 3 completion gate.

## Phase 3 TDD/review evidence

### Task 1 migration RED

Canonical RED `619db2cb966b188cf759ed51ccd374dc60a53d0b`, CI `33666738154`, job `100370241591`: 295 total / 291 PASS / exactly 4 expected migration-file-absent FAIL. No unrelated failure.

### Tasks 2-8 final candidates

- Task 2 `032c65102c9204688fb51937a250bf98a0dd1795`, CI `33667341942`: migration contract GREEN; SQL Git-only.
- Task 3 `70319add3f2a8c139b25fdb4ca5a3fefd80b14d9`, CI `33668791985`: 299/299 + typecheck/build PASS.
- Task 4 `e88ddbe84f89c48024856d7d53bad27ff45240cb`, CI `33669788637`: 305/305 + typecheck/build PASS.
- Task 5 `fc3007ae3ad5f20c8a9397de3131cb1c5f39eea6`, CI `33672384721`: 313/313 + typecheck/build PASS.
- Task 6 `bc66eaf932b5dc3c710813cce8c3abd503cc6b1d`, CI `33673027354`: 318/318 + typecheck/build PASS.
- Task 7 `85bb1d880684e14ffbdb18fd66b875d6e8c5a2`, CI `33676377828`: 327/327 + typecheck/build PASS.
- Task 8 `126158df19cc51f97154006f830ad31222ce8e89`, CI `33677214460`: 334/334 + typecheck/build PASS.

### Task 9 secure claim

Canonical RED `f9c95f73801155da583365d553431b68df6595c7`: 343 total / 334 PASS / exactly 9 expected Task 9 failures before runtime.

Final candidate `c8e836cf69de086d2000d0fc9904af9b24d2307b`, CI `33682338553`, job `100421604971`: **343/343 PASS**, typecheck PASS, build PASS, 24/24 pages.

### Task 10 customer UI

Canonical RED `c1d201fdaf59db94629b6b5189ef13c291fb3950`, CI `33682792731`, job `100423066698`: 351 total / 344 PASS / exactly 7 Task 10 failures before UI runtime.

Final UI runtime candidate `a8cda3d929e0af86810137f423c0ce625f448391`, CI `33683574794`, job `100425591216`: **351/351 PASS**, typecheck PASS, build PASS, 28/28 pages.

### Task 11 security/isolation

Initial test commit `575be0ecd07353c2dc94ce3e45dcdfb8710e213e`, CI `33683938053`, job `100426772012`: 359 total / 358 PASS / one brittle test assertion FAIL. The test incorrectly demanded literal `customer_id = auth.uid()` while SQL intentionally stores `auth.uid()` in `v_customer_id` and compares `o.customer_id = v_customer_id`. Runtime was not changed for this failure.

After fixing only the security test assertion/typing fixture, exact candidate `1f2432bd000e7e01201d0f2d632cac51399f86d0`, CI `33684404621`, job `100428283809`:

- [x] 359/359 tests PASS;
- [x] customer A repository session cannot retrieve B order;
- [x] missing and other-owned detail both return null behavior;
- [x] own-order SQL authorization derives from `auth.uid()` and accepts no customer UUID parameter;
- [x] public token tracking remains independent;
- [x] wrong verified email + valid token stays generic `not_claimable`;
- [x] email-only/token-only claim impossible;
- [x] customer session cannot satisfy admin boundary;
- [x] customer DTO forbidden-field matrix PASS;
- [x] typecheck PASS;
- [x] build PASS, 28/28 pages.

### Task 12 full candidate review

Exact reviewed runtime candidate: `1f2432bd000e7e01201d0f2d632cac51399f86d0`.

- [x] The nine focused Phase 3 test files required by the plan all ran and passed inside CI `33684404621`.
- [x] Full `pnpm test`: 359/359 PASS.
- [x] Full `pnpm typecheck`: PASS.
- [x] Full `pnpm build`: PASS, 28/28 pages.
- [x] Diff from accepted Phase 2 checkpoint `68e50102cfcaa5c9720432db1d1e504d5e7e1267` reviewed.
- [x] No static-catalog authority switch.
- [x] No label purchase/spending capability.
- [x] No Phase 6 transactional notification implementation.
- [x] No hosting redesign.
- [x] Admin UUID/AAL2/session requirements unchanged.
- [x] Mercado Pago remains provider-authoritative; no local customer payment mutation.
- [x] Browser never chooses customer UUID.
- [x] Customer list/detail ownership derives from `auth.uid()`.
- [x] Claim is service-role-only, verifies current Auth email, locks order row and requires public token.
- [x] Email-only claim does not exist.
- [x] Account DTOs exclude public token and all reviewed internals.
- [x] No passwords/tokens were added to account audit/events/docs/logging contract.
- [x] Review found no runtime defect requiring application-code changes.

## Phase 3 rollout gates

- [x] Every implemented runtime unit has valid RED-before-GREEN evidence.
- [x] Full candidate test/typecheck/build PASS.
- [x] No broad order/customer ownership mutation API.
- [x] Customer A cannot access B by copied/guessed order UUID through the reviewed boundary.
- [x] Public token never appears in customer account DTOs.
- [x] Guest claim requires both verified identity and token possession.
- [x] Admin UUID/AAL2/session boundary unchanged.
- [x] Mercado Pago financial state untouched.
- [x] Phase 3 DDL was intentionally kept unapplied through Task 12.
- [x] No merge/new Production application deployment occurred.
- [ ] Owner explicitly approves Task 13 exact DDL application.
- [ ] Migration is applied/rollback-validated with zero fixtures.
- [ ] Task 14 Preview acceptance passes.
- [ ] Task 15 records Phase 3 complete.

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
23. Phase 3 exact reviewed runtime candidate is `1f2432bd000e7e01201d0f2d632cac51399f86d0`, CI `33684404621`, job `100428283809`: 359/359 tests, typecheck, build all PASS.
24. Phase 3 migration `202609020003_customer_accounts_orders.sql` exists in Git, is reviewed, and is **not applied** until explicit Task 13 owner approval.
25. Phase 3 Task 13 DB validation must use rollback-only synthetic fixtures and prove zero persistent test rows.
26. Merge and new Production application deployment remain separate owner decisions even after Phase 3 Preview acceptance.

## Current Session Checkpoint

**Status:** PHASE 1 COMPLETE/APPLIED; PHASE 2 COMPLETE/APPLIED/PREVIEW ACCEPTED; PHASE 3 TASKS 1-12 COMPLETE/REVIEWED; TASK 13 OWNER DDL APPROVAL GATE.

**Current branch:** `feat/admin-dashboard-expansion`.

**Phase 2 final runtime candidate:** `abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7`, CI `33650730746` PASS.

**Phase 3 reviewed runtime candidate:** `1f2432bd000e7e01201d0f2d632cac51399f86d0`, CI `33684404621`, job `100428283809`, 359/359 tests + typecheck + build PASS.

**Phase 3 plan:** `docs/superpowers/plans/2026-09-02-customer-account-orders.md`.

**Phase 3 DB:** exact migration `supabase/migrations/202609020003_customer_accounts_orders.sql` EXISTS IN GIT / REVIEWED / **NOT APPLIED**.

**Merge/new Production application deployment:** NOT APPROVED.

**NEXT EXACT ACTION:** obtain explicit owner approval for Task 13. Only after approval, apply exactly `202609020003_customer_accounts_orders.sql` once to the current ProxyBembem Supabase project; verify migration history/schema/grants/RLS; execute the plan's rollback-only ten-scenario ownership/claim matrix; prove zero synthetic orders/profiles/events remain; run Supabase advisors; record exact evidence. Then proceed to Task 14 Preview acceptance. Do not merge or promote Production.