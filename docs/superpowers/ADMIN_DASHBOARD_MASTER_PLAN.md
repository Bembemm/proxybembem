# ProxyBembem Admin Dashboard Expansion — Master Plan

> **Operational source of truth.** Read this file together with `docs/superpowers/CURRENT_STATUS.md`. The current status file is the canonical continuation checkpoint; older files under `docs/superpowers/plans/` and `docs/superpowers/specs/` preserve implementation history and may describe behavior that was intentionally superseded.

**Goal:** expand the secure `/admin` into the operational store dashboard and provide a private customer account area without weakening checkout, Mercado Pago, Melhor Envio, Supabase or admin authentication.

**Architecture:** modular monolith in the existing Next.js + Supabase application.

**Approved umbrella design:** `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`

**Current branch:** `feat/admin-dashboard-expansion`

**Base branch:** `main`

## Status semantics

- `[ ]` not started
- `[~]` in progress / evidence incomplete
- `[x]` complete with required evidence

Do not merge, squash, rebase, delete or force-move the feature branch without explicit owner approval. Do not perform provider spending, destructive cleanup or meaningful new DDL without the appropriate explicit gate.

## Current global invariants

- [x] `/admin` security is authorization/MFA, not URL secrecy.
- [x] Admin access requires the immutable authorized Supabase UUID, password, mandatory TOTP/AAL2, one active server-side admin session, inactivity expiry and fail-closed behavior.
- [x] Customer authentication is separate from admin authorization.
- [x] Catalog browsing, cart editing and freight quotation remain public.
- [x] **Starting payment requires a verified authenticated customer. There is no active guest checkout/payment fallback.**
- [x] Every checkout-created order is bound server-side to the verified Supabase Auth UUID and authoritative confirmed account e-mail.
- [x] Customer order details are private and use `/minha-conta/pedidos/{uuid}`.
- [x] `/pedido/[token]`, guest-claim UI/API/service and public order lookup are absent from the active application.
- [x] The legacy `orders.public_token` column and old guest-claim RPC may remain temporarily in Postgres only as schema compatibility; active application code must not depend on them.
- [x] Mercado Pago remains payment authority; no local admin/customer action marks an order paid/refunded.
- [x] Fulfillment remains independent from payment state except for the trusted automatic `approved -> awaiting_production` transition.
- [x] Browser values never choose authoritative product price, freight price, payment total or customer ownership UUID.
- [x] Historical `orders.items` remains immutable purchase truth.
- [x] Label purchase is never automatic after payment.
- [x] Secrets, tokens, passwords, TOTP material and internal credentials never enter client responses, audit/events, docs or commits.
- [x] Existing Supabase project is intentionally evolved in place; already-applied migrations must not be reapplied.

---

# PHASE 0 — Design + Planning

**State:** COMPLETE.

- [x] Create `feat/admin-dashboard-expansion` from accepted `main`.
- [x] Approve modular-monolith design.
- [x] Create Master Plan + CURRENT_STATUS checkpoint system.
- [x] Define security/payment/fulfillment/customer/catalog/shipping/notification boundaries.

---

# PHASE 1 — Data + Audit Foundation

**Plan:** `docs/superpowers/plans/2026-09-02-admin-data-audit-foundation.md`

**State:** COMPLETE — CODE VERIFIED + MIGRATIONS APPLIED/VALIDATED.

- [x] Add compatibility-safe `orders.fulfillment_status`.
- [x] Backfill approved -> `awaiting_production`, others -> `awaiting_payment`, without fabricated history.
- [x] Add `order_events`, `order_attention_flags` and append-only `admin_audit_log`.
- [x] Preserve Mercado Pago RPC financial integrity and automatic approved-payment transition only.
- [x] Keep browser roles blocked and narrow service-role privileges.
- [x] Refund/chargeback preserves physical fulfillment and opens attention where required.
- [x] Apply/transaction-test the real DB migration after owner approval.
- [x] Zero Phase 1 synthetic fixtures remain.

Primary Phase 1 runtime candidate: `0ce3b371eda1cfccbd8ddde639b07e7b7ae57848`, CI `33590493640` PASS.

---

# PHASE 2 — Admin Orders + Fulfillment

**Plan:** `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`

**State:** COMPLETE — CODE/TDD/SECURITY/SCOPE/DB/PREVIEW ACCEPTED.

Final reviewed runtime candidate: `abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7`.

CI `33650730746`, job `100316764581`: tests, typecheck and build PASS.

Applied migration: `20260902160658_admin_order_fulfillment_operations`.

- [x] Structural DB validation PASS.
- [x] Controlled rollback matrix 16/16 PASS.
- [x] Zero Phase 2 fixtures remain.
- [x] `/admin/pedidos`, `/admin/pedidos/[id]`, `/admin/producao` implemented.
- [x] Narrow same-origin/AAL2 fulfillment POST actions implemented.
- [x] Cancellation requires explicit confirmation and never changes Mercado Pago financial state.
- [x] Shared protected admin shell/navigation implemented.
- [x] Exact diff/security/concurrency review PASS.
- [x] Authenticated owner acceptance with password + TOTP PASS.

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

# PHASE 3 — Customer Account + Private Owned Orders

**Primary historical plan:** `docs/superpowers/plans/2026-09-02-customer-account-orders.md`

**Superseding checkout/private-order design:** `docs/superpowers/specs/2026-09-06-authenticated-checkout-private-orders-design.md`

**Superseding checkout/private-order plan:** `docs/superpowers/plans/2026-09-06-authenticated-checkout-private-orders.md`

**Durable recovery design:** `docs/superpowers/specs/2026-09-05-password-recovery-durable-grant-design.md`

**State:** **COMPLETE — DATABASE APPLIED/VALIDATED, KINGHOST DEPLOYED, PRODUCTION ACCEPTED.**

The original 2026-09-02 Phase 3 design allowed guest checkout and public-token order tracking. Before public launch, the owner explicitly replaced that model with authenticated payment start and private account-owned orders. The later 2026-09-06 design controls current behavior.

## Final Phase 3 decisions

- [x] Supabase Auth e-mail is the unique account identity; names may duplicate.
- [x] Customer profiles stay minimal: Auth UUID, name, WhatsApp, timestamps. E-mail remains authoritative in Supabase Auth.
- [x] Payment start requires a verified customer account.
- [x] Checkout ownership comes only from trusted server-resolved Supabase Auth UUID/e-mail.
- [x] A mismatching checkout e-mail is rejected; the browser never chooses `customer_id`.
- [x] Checkout-attempt reuse is same-owner only.
- [x] Customer list/detail RPCs derive ownership from `auth.uid()` and return curated safe DTOs.
- [x] Account A cannot read Account B's order by copied/guessed UUID; not-owned and missing are indistinguishable.
- [x] Mercado Pago return URLs use `/minha-conta/pedidos/{uuid}`.
- [x] `/pedido/[token]` and guest claim application surfaces were removed.
- [x] Anonymous cart/address/freight state survives the login handoff using bounded same-tab storage; freight is freshly quoted after login and the old quote token is never reused.
- [x] The cart drawer closes while the login page is shown and restores only after returning to `/produtos`.
- [x] Password login creates the SSR Supabase session directly in response cookies; `/api/checkout` participates in session refresh.
- [x] Durable scanner-safe password recovery uses an application-owned grant and passed fresh production reset/login acceptance.

## Phase 3 database state

Applied customer-account migration:

- Git file: `supabase/migrations/202609020003_customer_accounts_orders.sql`
- hosted migration history: `20260902220354_customer_accounts_orders`
- rollback-only ownership/claim validation matrix: **10/10 PASS**

Applied durable recovery migration:

- Git file: `supabase/migrations/202609050001_password_recovery_grants.sql`
- hosted migration history: `20260906190757_password_recovery_grants`
- RLS/grants/RPC security validation: PASS

**Do not reapply either migration.**

## Phase 3 production acceptance

- [x] Anonymous customer can build cart, fill address and select freight.
- [x] Anonymous payment attempt requires login and does not create an anonymous order/preference.
- [x] Checkout draft survives login and restores only on `/produtos`.
- [x] Authenticated checkout succeeds and creates an owned pending order/preference.
- [x] Account A can open its private order.
- [x] Account B cannot access Account A's exact order UUID and receives not-found behavior.
- [x] Legacy `/pedido/<token>`-shaped URLs return 404/not found with no order/customer data.
- [x] Fresh password recovery/reset/login succeeds; recovery credential replay fails closed.
- [x] Acceptance-only synthetic orders were removed afterward; no Auth user was deleted by that narrow cleanup.

Final deployed Phase 3 runtime code: `2945f495ba273055d64251bdd310df3947b629f6`.

CI run `34061829912`: exact Node 22.1.0, frozen install, typecheck, KingHost build, private-route gate, startup smoke and **406/406 tests PASS**.

The documentation-only completion checkpoint does not require a KingHost redeploy.

---

# PHASE 4 — Database Catalog + Admin Products

**State:** NOT STARTED / UNBLOCKED AFTER OWNER CHOOSES BRANCH INTEGRATION HANDLING.

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

# PHASE 9 — Hardening + Final Rollout

- [ ] Full authorization isolation matrix across all final modules.
- [ ] CSRF/origin/rate-limit/log-secret checks.
- [ ] Concurrency/idempotency matrix.
- [ ] Full regression suite.
- [ ] Exact candidate test/typecheck/KingHost build + CI PASS.
- [ ] Owner acceptance for the final combined scope.
- [ ] Explicit staged rollout/merge approval.
- [ ] Verify exact post-merge `main` CI/deployment SHA.
- [ ] Do not delete the feature branch unless the owner asks.

---

## Decisions future chats must not rediscover

1. Architecture is a modular monolith.
2. `/admin` security is authorization/MFA, not URL obscurity.
3. Mercado Pago remains payment authority; fulfillment is independent.
4. Trusted payment approval is the only automatic `awaiting_payment -> awaiting_production` transition.
5. Refund/chargeback never falsifies physical fulfillment.
6. No generic arbitrary admin order/payment PATCH.
7. Browsing/cart/freight remain public, but **payment start requires a verified customer account**.
8. New checkout-created orders are private account-owned orders from creation time.
9. Browser never chooses `customer_id` or authoritative checkout e-mail.
10. `/pedido/[token]` and guest-claim application surfaces must not be restored.
11. Legacy `public_token`/claim RPC are temporary database compatibility only until a later explicit pre-launch cleanup.
12. Customer order RPCs derive ownership from `auth.uid()` and return curated safe DTOs.
13. Customer auth and admin auth are separate boundaries.
14. Catalog moves to Supabase only in Phase 4 and in stages; browser price remains untrusted.
15. Label spending is explicit and remains Phase 5.
16. Existing Supabase project remains hosted separately from KingHost and already-applied migrations are never reapplied.
17. KingHost Node.js 22.1.0 is the active application runtime; `docs/deployment/kinghost.md` is the canonical deployment runbook.
18. Phase 3 is complete and production-accepted; do not redo it unless a regression is discovered.
19. Broader test-account/test-data cleanup and removal of legacy schema are separate explicit pre-launch operations.
20. Merge/integration is still an explicit owner decision.

## Current checkpoint

**Status:** PHASE 0 COMPLETE; PHASE 1 COMPLETE/APPLIED; PHASE 2 COMPLETE/APPLIED/ACCEPTED; **PHASE 3 COMPLETE/APPLIED/DEPLOYED/PRODUCTION-ACCEPTED**.

**Current branch:** `feat/admin-dashboard-expansion`.

**Active runtime:** KingHost Node.js 22.1.0 + hosted Supabase.

**Phase 4:** unblocked but not started.

**Merge/integration:** not yet chosen by the owner.

**NEXT EXACT ACTION:** keep the Phase 3 runtime unchanged, reconcile/verify operational documentation, then let the owner choose whether to merge to `main`, create a PR, or keep the branch. Only after that choice should Phase 4 or a separately approved pre-launch clean-slate/hardening operation begin.
