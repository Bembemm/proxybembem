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
- [x] Admin security remains UUID allowlist + Supabase Auth + mandatory TOTP/AAL2 + one active server-side session + inactivity expiry + fail closed.
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
- [x] Hosting migration/config redesign is outside this project phase.
- [x] Paid Supabase development branch is not a mandatory workflow; owner chose the existing-project workflow.

---

# PHASE 0 — Design + Planning

**State:** COMPLETE.

- [x] Create `feat/admin-dashboard-expansion` from accepted main.
- [x] Write/approve architectural design.
- [x] Create Master Plan/checkpoint system.
- [x] Write/review Phase 1 plan.
- [x] Catch PostgREST dedupe, partial-index handling and recursive secret-validation concerns before runtime implementation.

---

# PHASE 1 — Data + Audit Foundation

**Plan:** `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md`

**State:** COMPLETE — CODE VERIFIED + MIGRATION APPLIED/VALIDATED ON CURRENT SUPABASE. FEATURE BRANCH NOT MERGED.

- [x] Add compatibility-safe `orders.fulfillment_status`.
- [x] Backfill approved -> `awaiting_production`; others -> `awaiting_payment`; no fabricated events.
- [x] Add `order_events`, `order_attention_flags`, append-only `admin_audit_log`.
- [x] Browser roles blocked; service-role privileges narrowed.
- [x] Preserve Mercado Pago RPC input signature and financial integrity boundary.
- [x] Trusted approval owns only automatic `awaiting_payment -> awaiting_production`.
- [x] Refund/chargeback preserves physical fulfillment.
- [x] Amount/currency mismatch -> manual review.
- [x] Audit/event history cannot be UPDATE/DELETE by service role.
- [x] Apply migration after owner approval and validate real current data/transaction paths.
- [x] Production `/admin` remained healthy after additive DB change.

Primary Phase 1 runtime candidate: `0ce3b371eda1cfccbd8ddde639b07e7b7ae57848`, CI `33590493640` PASS.

Owner workflow decision: evolve the existing Supabase project in place as schema is needed. No paid Supabase development branch is required. Meaningful DDL still stops for explicit owner approval.

---

# PHASE 2 — Admin Orders + Fulfillment

**Plan:** `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`

**State:** COMPLETE — CODE/TDD/SECURITY/SCOPE/DB/PREVIEW VERIFIED. FEATURE BRANCH NOT MERGED. NEW PRODUCTION APP DEPLOYMENT NOT APPROVED.

## Planning/contract decisions

- [x] List RPC returns `{orders,total}` so empty/out-of-range pages retain total.
- [x] Date filtering uses `America/Sao_Paulo` boundaries.
- [x] Search wildcard characters are treated literally.
- [x] Paid cancellation opens `canceled_paid_order`; it never refunds locally.
- [x] Actual Mercado Pago reversal resolves only cancellation-specific attention.
- [x] Next.js 16 async params/searchParams handled explicitly.
- [x] Append-only audit/event privileges preserved.
- [x] Browser never supplies admin UUID, payment mutation or arbitrary fulfillment target.

## Implementation tasks

- [x] Task 1 — migration contract RED (`75f3a075...`, CI `33615089014`).
- [x] Task 2 — additive Phase 2 migration implemented/reviewed.
- [x] Task 3 — backend-only admin read repository (`f8ded33f...`, CI `33634645304` PASS).
- [x] Task 4 — strict atomic fulfillment operation repository (`f2714347...`, CI `33634997803` PASS).
- [x] Task 5 — five narrow same-origin/AAL2 POST routes (`15fa3e17...`, CI `33635899966` PASS).
- [x] Task 6 — protected shared admin shell/nav/status badges (`58b2fd70...`, CI `33636760106` PASS).
- [x] Task 7 — `/admin/pedidos` list/search/filter/pagination (`f1aa1fc4...`, CI `33645894040` PASS).
- [x] Task 8 — `/admin/pedidos/[id]` detail/timeline/audit/actions (`1dd2446b...`, CI `33646901907` PASS).
- [x] Task 9 — destructive cancellation confirmation (`d9c1a49b...`, CI `33647900422` PASS).
- [x] Task 10 — `/admin/producao` three oldest-first queues (`40019e59...`, CI `33650042499` PASS).
- [x] Task 11 — exact scope/security/concurrency review + full CI.
- [x] Task 12 — exact reviewed migration applied to current Supabase after owner approval; structure + rollback matrix + advisors validated.
- [x] Task 13 — automated + authenticated owner Preview acceptance.
- [x] Task 14 — Phase 2 completion gate.

## Final runtime/security evidence

Final reviewed Phase 2 runtime candidate:

`abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7`

CI `33650730746`, job `100316764581`, freshly rechecked at completion gate:

- [x] `pnpm test` PASS.
- [x] `pnpm typecheck` PASS.
- [x] `pnpm build` PASS.
- [x] workflow conclusion SUCCESS.

Task 11 review verified:

- [x] no browser payment mutation;
- [x] no browser-supplied admin UUID/arbitrary target;
- [x] mutations enforce same-origin before sensitive work and active AAL2 admin authorization;
- [x] dynamic route params are awaited/UUID-validated;
- [x] list/detail DTOs exclude public token, checkout fingerprint/attempt/URL and shipping snapshot;
- [x] fulfillment mutation uses `FOR UPDATE` row lock;
- [x] status + event + audit + paid-cancel attention are one DB transaction;
- [x] cancellation never alters Mercado Pago state;
- [x] actual refund/chargeback resolves only `canceled_paid_order`;
- [x] audit/event append-only privileges remain;
- [x] temporary Vercel `ignoreCommand` was removed from Phase 2 scope;
- [x] paid-cancel duplicate suppression targets `(order_id, code) WHERE resolved_at IS NULL`; generic conflict swallowing is forbidden.

## Task 12 — Supabase application/validation

Applied migration after explicit owner approval:

`20260902160658_admin_order_fulfillment_operations`

Current project:

`ProxyBembem` (`kicgoocozxzkuoqajqif`)

- [x] Migration application succeeded.
- [x] `admin_list_orders`, `admin_transition_order_fulfillment`, `resolve_canceled_paid_order_attention` are `SECURITY DEFINER` with fixed/empty search path.
- [x] Admin list/transition RPCs remain service-role-only; `anon`/`authenticated` denied.
- [x] Reversal trigger exists/enabled.
- [x] `order_events` and `admin_audit_log` remain append-only for service role.
- [x] Controlled rollback matrix passed **16/16**.
- [x] Valid/invalid transitions and approved-payment precondition verified.
- [x] Same-target retry is idempotent with no duplicate event/audit.
- [x] Paid cancellation keeps payment approved and opens `canceled_paid_order`.
- [x] Real refund/chargeback resolves only cancellation-specific attention and retains provider reversal attention.
- [x] Non-reversal statuses do not resolve paid-cancel attention.
- [x] Nonexistent order returns `not_found`.
- [x] Post-validation fixtures: 0 orders, 0 events, 0 attention, 0 audit.
- [x] Advisor warnings reviewed; no Phase 2 blocker introduced.

## Task 13 — Preview acceptance PASS

Automated acceptance proved:

- [x] storefront `/` and `/produtos` render;
- [x] protected admin surfaces do not expose data unauthenticated;
- [x] invalid public order token returns safe 404;
- [x] Preview CSP includes current Supabase origin and sandbox Melhor Envio form action;
- [x] no payment/refund/fulfillment mutation/OAuth reauthorization/label purchase occurred during smoke.

Owner then authenticated normally with existing password + TOTP and completed read-only smoke **5/5**:

- [x] `/admin` shell loaded;
- [x] `/admin/pedidos` loaded real orders;
- [x] one existing `/admin/pedidos/[id]` detail loaded with operational sections, timeline and audit;
- [x] `/admin/producao` loaded queues;
- [x] `/admin/integrations/melhor-envio` loaded.

Deployment-scoped logs after owner smoke showed all protected request paths, including the real order detail, and **zero `error`/`fatal` entries** in the checked window.

## Task 14 — completion gate PASS

Phase 2 completion criteria:

- [x] every new migration/server/UI unit has RED -> GREEN evidence;
- [x] focused suites passed;
- [x] exact candidate test/typecheck/build pass in CI;
- [x] exact diff/security/concurrency review passes;
- [x] migration separately owner-approved/applied/transaction-tested;
- [x] no fixture rows remain;
- [x] protected Preview environment works under actual AAL2 owner session;
- [x] list/detail/production smoke matrix passes;
- [x] Mercado Pago remains provider-authoritative;
- [x] storefront/public tracking regression smoke passes;
- [x] final evidence recorded in Master Plan + CURRENT_STATUS;
- [x] merge/new Production application deployment remains a separate explicit owner decision.

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

**State:** PLANNING GATE — checkout email decision required before runtime implementation.

Approved architecture already decided:

- customer area is separate from `/admin`;
- routes include `/minha-conta`, `/minha-conta/pedidos`, `/minha-conta/pedidos/[id]`, profile/security, `/entrar`, `/criar-conta`, `/esqueci-a-senha`;
- permanent password + verified email + reset by email;
- email unique case-insensitively; names may duplicate;
- immutable `customer_id` / Supabase Auth UUID owns relationships;
- `customer_profiles` stores minimal profile data (name/email/WhatsApp), not card data;
- address/CPF remain per-order when needed, not permanent profile defaults unless separately designed later;
- guest checkout remains supported;
- logged-in checkout attaches `customer_id`;
- public token guest tracking remains supported;
- guest order claim requires reliable proof, never name-only;
- customer can read only orders attached to their own customer UUID;
- WhatsApp is direct contact only, no internal chat.

**Unresolved decision:** whether email becomes required at checkout for new guest orders. This must be explicit before Phase 3/customer-notification runtime because verified email is needed for account identity, secure guest-order claiming and transactional order notices. Do not infer silently.

Next Phase 3 steps after owner decision:

- [ ] Review/update Phase 3 plan with checkout-email decision.
- [ ] Add `customer_profiles` + nullable `orders.customer_id` additively.
- [ ] Auth verification/reset and ownership isolation tests.
- [ ] Customer order list/detail/status/tracking.
- [ ] Secure old/guest order claim if supported by chosen proof model.
- [ ] Cross-customer/takeover negative tests.
- [ ] Preview acceptance before any merge/Production rollout.

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
- [ ] Expand OAuth with least privilege and explicit reauthorization only when required.
- [ ] Dedicated shipment model with idempotency/snapshots.
- [ ] Flow: ready -> review -> prepare -> show final cost -> explicit buy -> generate/print/download -> tracking.
- [ ] Never auto-buy label after payment.
- [ ] Cancel/spend actions require explicit confirmation.
- [ ] Address correction is audited; after label purchase require cancel/recreate rather than silent mutation.
- [ ] Sandbox acceptance before real balance spending capability.

---

# PHASE 6 — Transactional Notifications

- [ ] Production-capable email provider/mechanism with runtime-only credentials.
- [ ] Outbox/jobs with dedupe and retry.
- [ ] Email failure never rolls back payment/order state.
- [ ] Verification/reset + order created/payment approved/production/ready/shipped/cancel/refund notices.
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

1. Modular monolith.
2. `/admin` security is authorization/MFA, not obscurity.
3. Mercado Pago is payment authority; fulfillment is independent.
4. Trusted payment approval is the only automatic `awaiting_payment -> awaiting_production` transition.
5. Refund/chargeback never falsifies physical state.
6. No generic arbitrary admin order/payment PATCH.
7. Customer account remains separate from admin; guest checkout remains.
8. Catalog moves to Supabase in stages; browser price never trusted.
9. Historical `orders.items` snapshots remain immutable.
10. Label spending always explicit; never auto-buy after payment.
11. Notifications use outbox isolation; provider failure cannot corrupt order/payment truth.
12. No fabricated historical facts.
13. Existing Supabase project is intentionally evolved in place; paid dev branch is not a prerequisite.
14. Meaningful current-project DDL stops for explicit owner approval.
15. Preview environment for the current branch was fixed; temporary Vercel `ignoreCommand` was removed from candidate scope.
16. Phase 2 list RPC returns `{orders,total}` and dates use `America/Sao_Paulo`.
17. Paid cancellation does not refund; actual reversal resolves only `canceled_paid_order`.
18. Paid-cancel duplicate suppression targets only the active partial index; generic conflict swallowing is forbidden.
19. Phase 2 migration is applied as `20260902160658_admin_order_fulfillment_operations`; do not rediscover or reapply it.
20. Task 12 rollback validation passed 16/16 and left zero fixtures.
21. Task 13 authenticated AAL2 Preview smoke passed 5/5 and post-smoke logs had zero error/fatal entries.
22. Phase 2 is COMPLETE but **not merged and not deployed as new Production application code**.
23. Before Phase 3 runtime, owner must explicitly decide whether email is required at checkout for new guest orders.

## Current Session Checkpoint

**Status:** PHASE 1 COMPLETE/APPLIED; PHASE 2 COMPLETE/APPLIED/PREVIEW ACCEPTED; PHASE 3 PLANNING GATE NEXT.

**Current branch:** `feat/admin-dashboard-expansion`

**Final verified Phase 2 runtime candidate:** `abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7`, CI `33650730746` — test/typecheck/build PASS.

**Phase 2 Supabase migration:** `20260902160658_admin_order_fulfillment_operations` — APPLIED + STRUCTURAL PASS + 16/16 ROLLBACK MATRIX PASS + ZERO FIXTURES.

**Task 13:** authenticated owner Preview smoke 5/5 PASS; logs show all protected paths and zero error/fatal in checked window.

**Task 14:** PASS. Phase 2 is complete.

**Merge/new Production application deployment:** NOT APPROVED.

**NEXT EXACT ACTION:** ask the owner whether email should be required at checkout for new guest orders, record that Phase 3 architecture decision, then review/update `docs/superpowers/plans/2026-09-02-customer-account-orders.md` before any customer-account runtime implementation. Do not merge or promote Production implicitly.
