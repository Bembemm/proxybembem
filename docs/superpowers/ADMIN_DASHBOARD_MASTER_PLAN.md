# ProxyBembem Admin Dashboard Expansion — Master Plan

> **Operational source of truth.** Read the approved design, this file, `docs/superpowers/CURRENT_STATUS.md`, then the active phase plan. Never equate IMPLEMENTED, TESTED, PREVIEW APPROVED, DB APPLIED, and PRODUCTION APPROVED.

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
- [x] Paid Supabase development branch is not a mandatory workflow; owner chose the existing project workflow.

---

# PHASE 0 — Design + Planning

**State:** COMPLETE.

- [x] Create `feat/admin-dashboard-expansion` from accepted main.
- [x] Write/approve architectural design.
- [x] Create Master Plan/checkpoint system.
- [x] Write/review Phase 1 plan.
- [x] Phase 1 planning caught PostgREST dedupe, partial-index handling and recursive secret-validation concerns before runtime implementation.

---

# PHASE 1 — Data + Audit Foundation

**Plan:** `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md`

**State:** CODE VERIFIED + MIGRATION APPLIED/VALIDATED ON CURRENT SUPABASE. FEATURE BRANCH NOT MERGED.

- [x] Add compatibility-safe `orders.fulfillment_status`.
- [x] Backfill approved -> `awaiting_production`; others -> `awaiting_payment`; no fabricated events.
- [x] Add `order_events`, `order_attention_flags`, append-only `admin_audit_log`.
- [x] Browser roles blocked; service-role privileges narrowed.
- [x] Preserve Mercado Pago RPC input signature.
- [x] Trusted approval owns only automatic `awaiting_payment -> awaiting_production`.
- [x] Refund/chargeback preserves physical fulfillment.
- [x] Amount/currency mismatch -> manual review.
- [x] Verify audit/event history cannot be UPDATE/DELETE by service role.
- [x] Apply migration after owner approval and validate current data/transaction paths.
- [x] Production `/admin` remained healthy after additive DB change.
- [x] Preview env issue was diagnosed and owner aligned Preview configuration; fresh protected Preview returned 200.

Primary Phase 1 code candidate: `0ce3b371eda1cfccbd8ddde639b07e7b7ae57848`, CI `33590493640` PASS.

---

# PHASE 2 — Admin Orders + Fulfillment

**Plan:** `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`

**State:** TASKS 1–11 CODE/TDD/SECURITY/SCOPE VERIFIED. TASK 12 WAITING OWNER APPROVAL TO APPLY EXACT DDL.

## Planning/contract decisions

- [x] List RPC returns `{orders,total}` so empty/out-of-range pages retain total.
- [x] Date filtering uses `America/Sao_Paulo` boundaries.
- [x] Search wildcard characters are treated literally.
- [x] Paid cancellation opens `canceled_paid_order`; it never refunds locally.
- [x] Actual Mercado Pago reversal resolves only cancellation-specific attention.
- [x] Next.js 16 async params/searchParams handled explicitly.
- [x] Append-only audit/event privileges preserved.

## Implementation tasks

- [x] Task 1 — migration contract RED captured before SQL (`75f3a075...`, CI `33615089014`).
- [x] Task 2 — additive Phase 2 migration implemented in Git only.
- [x] Task 3 — backend-only admin read repository (`f8ded33f...`, CI `33634645304` PASS).
- [x] Task 4 — strict atomic fulfillment operation repository (`f2714347...`, CI `33634997803` PASS).
- [x] Task 5 — five narrow same-origin/AAL2 POST routes with fixed server targets (`15fa3e17...`, CI `33635899966` PASS).
- [x] Task 6 — protected shared admin shell/nav/status badges (`58b2fd70...`, CI `33636760106` PASS).
- [x] Task 7 — `/admin/pedidos` server list/search/filter/pagination (`f1aa1fc4...`, CI `33645894040` PASS).
- [x] Task 8 — `/admin/pedidos/[id]` operational detail/timeline/audit/actions (`1dd2446b...`, CI `33646901907` PASS).
- [x] Task 9 — destructive cancellation confirmation (`d9c1a49b...`, CI `33647900422` PASS).
- [x] Task 10 — `/admin/producao` three oldest-first active queues (`40019e59...`, CI `33650042499` PASS).
- [x] Task 11 — full suite/typecheck/build + exact scope/security/concurrency review.
- [~] Task 12 — STOP gate: owner approval required before applying exact Phase 2 migration to current Supabase.

## Task 11 findings and evidence

- [x] Phase 2 scope baseline fixed at `5662704188d7d8555dba148fbb6d8593a74e2c84`.
- [x] Found temporary branch-specific Vercel `ignoreCommand` outside allowed Phase 2 scope; restored original cron-only `vercel.json` in `4b1d0e9627f1f67897a96290cac0c576682d5064`.
- [x] Re-compare shows no hosting configuration in the final Phase 2 diff.
- [x] Security review: no browser payment mutation/admin UUID/arbitrary target; routes same-origin + active AAL2; params awaited/UUID-validated; DTOs exclude checkout/public internals.
- [x] Concurrency review: fulfillment mutation uses row lock and one transaction for status + event + audit + paid-cancel attention; provider financial state is untouched.
- [x] Found generic paid-cancel `ON CONFLICT DO NOTHING`; added RED requiring precise partial-index inference (`a040701a...`, CI `33650490056`: exactly one expected failure).
- [x] Hardened SQL to `ON CONFLICT (order_id, code) WHERE resolved_at IS NULL DO NOTHING`.
- [x] Final runtime candidate `abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7`, CI `33650730746`: `pnpm test`, `pnpm typecheck`, `pnpm build` PASS.

## Phase 2 transition truth

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

## Phase 2 Task 12 acceptance sequence

- [ ] Owner explicitly approves applying `202609020002_admin_order_fulfillment_operations.sql` to existing project `ProxyBembem`.
- [ ] Apply only the exact reviewed migration.
- [ ] Verify functions, grants, trigger and no unintended schema changes.
- [ ] Transaction+rollback test valid transitions, invalid jumps, payment precondition, replay/concurrency behavior, paid cancellation and real reversal semantics.
- [ ] Prove zero validation fixtures persist.
- [ ] Smoke protected `/admin/pedidos`, detail and `/admin/producao` against the now-compatible DB.
- [ ] Update checkpoint with exact applied migration/evidence.
- [ ] Separate owner approval remains required before merge/new Production application deployment.

---

# PHASE 3 — Customer Account + Owned Orders

- [ ] Resolve checkout-email requirement explicitly before customer/notification implementation.
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

- [ ] Validated `products` table with integer-cent prices and shipping metadata.
- [ ] Seed exact current products and prove static/DB parity.
- [ ] `/admin/produtos` + explicit validated save + audit.
- [ ] Checkout remains server-authoritative; historical snapshots remain unchanged.
- [ ] Staged authority switch with rollback.

---

# PHASE 5 — Melhor Envio Shipments + Labels + Tracking

- [ ] Re-check current official API/scopes before implementation.
- [ ] Least-privilege OAuth expansion + explicit reauthorization.
- [ ] Dedicated shipments model.
- [ ] Prepare -> review cost -> explicit purchase -> generate/print -> track.
- [ ] Sandbox acceptance before real balance spending capability.

---

# PHASE 6 — Transactional Notifications

- [ ] Production-capable email mechanism with runtime-only credentials.
- [ ] Idempotent outbox/retries.
- [ ] Email failure never rolls back payment/order state.
- [ ] Account/order/payment/production/shipping/refund notices.

---

# PHASE 7 — Store Settings

- [ ] Typed safe allowlist.
- [ ] No infrastructure secrets.
- [ ] `/admin/configuracoes` explicit save/validation/confirmation/audit.

---

# PHASE 8 — Dashboard Metrics + Attention Center

- [ ] Timezone-aware reliable metrics.
- [ ] Fulfillment/shipping/attention/refund/manual-review counts.
- [ ] Product quantities from immutable snapshots.
- [ ] Bounded server aggregates.

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
7. Customer account later remains optional; guest checkout remains.
8. Catalog moves to Supabase in stages; browser price never trusted.
9. Label spending always explicit.
10. Notifications use outbox isolation.
11. No fabricated historical facts.
12. Existing Supabase project is intentionally evolved in place; paid dev branch is not a prerequisite.
13. Meaningful current-project DDL stops for explicit owner approval.
14. Preview environment for the current branch was fixed; temporary Vercel ignoreCommand was removed from the candidate.
15. Phase 2 list RPC returns `{orders,total}` and dates use `America/Sao_Paulo`.
16. Paid cancellation does not refund; actual reversal resolves only `canceled_paid_order`.
17. Paid-cancel duplicate suppression targets only the active partial index; generic conflict swallowing is forbidden.

## Current Session Checkpoint

**Status:** PHASE 1 APPLIED/VERIFIED; PHASE 2 TASKS 1–11 VERIFIED; TASK 12 OWNER DDL APPROVAL GATE

**Current branch:** `feat/admin-dashboard-expansion`

**Final verified Phase 2 runtime candidate:** `abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7`, CI `33650730746` — test/typecheck/build PASS.

**Phase 2 Supabase migration:** exists in Git; **NOT APPLIED**.

**Merge/new Production application deployment:** NOT APPROVED.

**NEXT EXACT ACTION:** obtain explicit owner approval, then apply exactly `supabase/migrations/202609020002_admin_order_fulfillment_operations.sql` from the reviewed candidate to the existing Supabase project. Validate it transactionally and prove zero fixtures persist before any merge/deployment discussion.
