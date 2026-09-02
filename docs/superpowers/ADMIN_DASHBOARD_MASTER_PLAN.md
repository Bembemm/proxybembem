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
- [x] Add `order_events`, `order_attention_flags`, and append-only `admin_audit_log`.
- [x] Browser roles blocked; required service-role privileges only.
- [x] Preserve Mercado Pago RPC input signature.
- [x] Trusted approval atomically performs only `awaiting_payment -> awaiting_production`.
- [x] Refund/chargeback preserves physical fulfillment and opens attention.
- [x] Amount/currency mismatch -> `manual_review` attention.
- [x] Add fulfillment, safe-metadata, event, attention, and audit server foundations.
- [x] Verify service_role cannot UPDATE/DELETE audit or order-event history.

## Evidence

- [x] Phase 1 verified code candidate `0ce3b371eda1cfccbd8ddde639b07e7b7ae57848`; CI `33590493640` test/typecheck/build PASS.
- [x] Documentation checkpoint `11eb39252cb8c00cdc64336582b53e69b5fb10a6`; CI `33590734705` PASS.
- [x] Supabase migration applied as `20260902091641_admin_order_operations_foundation` after owner authorization.
- [x] 25 existing orders validated; no NULL/wrong fulfillment backfill.
- [x] Transaction+rollback validated approval/replay/refund/chargeback/manual-review; 0 persistent fixtures.
- [x] Production `/admin` remains 200 login surface after DB migration; no error/fatal logs in validation window.
- [~] Preview `/admin` blocked by missing `NEXT_PUBLIC_SUPABASE_URL`; Preview not approved.

---

# PHASE 2 — Admin Orders + Fulfillment

**Plan:** `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`

**State:** PLAN REVIEWED; TASK 1 RED COMPLETE; MIGRATION GREEN IMPLEMENTATION NEXT.

## Planning gate

- [x] Inspect current admin shell/auth/integration route and Phase 1 repositories.
- [x] Write detailed Phase 2 implementation plan.
- [x] Self-review for TODO/TBD/placeholders: none.
- [x] List RPC returns `{orders,total}` so empty/out-of-range pages retain total.
- [x] Date filtering uses `America/Sao_Paulo` calendar boundaries.
- [x] Search `%`, `_`, `\` treated literally; attention severity deterministic.
- [x] Paid cancellation opens `canceled_paid_order` without refund; actual provider reversal resolves only that cancellation-specific alert.
- [x] One fixed handler result/redirect mapping.
- [x] Next.js 16 async params/searchParams explicitly handled.
- [x] Append-only audit/event privileges preserved.

## Task 1 — migration contract RED

- [x] Create only `tests/admin-order-operations-migration.test.ts`.
- [x] Test-only commit: `75f3a0752ee6fa6e80a821c4be23fb3a7f17e1e4`.
- [x] CI run `33615089014`, job `100198954546`.
- [x] Result: expected RED — 256 tests total, 252 pass, 4 fail.
- [x] All 4 failures are the new Phase 2 migration tests.
- [x] All 4 fail for the same expected reason: `ENOENT` for `supabase/migrations/202609020002_admin_order_fulfillment_operations.sql`.
- [x] No unrelated test regression in the RED run.
- [x] No Phase 2 migration/runtime implementation existed when RED was captured.

## Planned runtime work

- [~] Task 2: GREEN Phase 2 migration in Git only; **do not apply to Supabase yet**.
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
- [ ] STOP for owner approval before applying exact Phase 2 migration to current Supabase.
- [ ] Transaction/rollback validate transitions and leave 0 fixtures.
- [ ] Fix Preview env and complete Preview smoke matrix.
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

---

# PHASE 3 — Customer Account + Owned Orders

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
- [ ] Least-privilege OAuth expansion.
- [ ] Dedicated shipments model.
- [ ] Prepare -> review cost -> explicit purchase -> generate/print -> track.
- [ ] Sandbox acceptance before real balance capability.

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
13. Meaningful current-project DDL still stops for owner approval.
14. Preview admin env blocker remains open.
15. Phase 2 list RPC returns `{orders,total}` and dates use `America/Sao_Paulo`.
16. Paid cancellation does not refund; actual reversal resolves only `canceled_paid_order`.

## Current Session Checkpoint

**Status:** PHASE 1 VERIFIED; PHASE 2 TASK 1 RED VERIFIED; TASK 2 GREEN SQL NEXT; PREVIEW ENV BLOCKER OPEN

**Current branch:** `feat/admin-dashboard-expansion`

**Phase 1 Supabase migration:** applied/validated `20260902091641_admin_order_operations_foundation`.

**Phase 2 plan review:** `963c2d316451b62d43422d8685631a4cde33f177`.

**Phase 2 RED:** `75f3a0752ee6fa6e80a821c4be23fb3a7f17e1e4`, CI `33615089014`: 252 PASS / 4 expected ENOENT failures.

**Phase 2 Supabase migration:** does not exist / not applied.

**Preview:** not approved; protected route blocked by missing Preview `NEXT_PUBLIC_SUPABASE_URL`.

**Merge/new Production app deployment:** NOT APPROVED.

**NEXT EXACT ACTION:** create `supabase/migrations/202609020002_admin_order_fulfillment_operations.sql` to satisfy only the reviewed RED contract, run focused migration/payment/fulfillment tests, then full CI. Do not apply Phase 2 SQL to Supabase yet.