# ProxyBembem Admin Dashboard Expansion — Master Plan

> **Operational source of truth.** Read with `docs/superpowers/CURRENT_STATUS.md` and `docs/PROJECT_MASTER_OVERVIEW.md`. Historical specs/plans preserve TDD history; checklist boxes in them are not automatically current work.

**Goal:** maintain a secure operational store dashboard and private customer account area without weakening checkout, Mercado Pago, Melhor Envio, Supabase or admin authentication.  
**Architecture:** modular monolith in the existing Next.js + Supabase application.  
**Active branch:** `feat/phase-9-hardening-final-rollout`  
**Canonical integration branch:** `main`  
**Runtime:** Vercel Node.js **22.1.0** + hosted Supabase.

## Global invariants

- `/admin` security is authorization/MFA, not URL secrecy.
- Admin access requires immutable owner UUID, password, TOTP/AAL2 and active server-side admin session.
- Customer auth is separate from admin authorization.
- Browsing/cart/freight are public; payment start requires verified authenticated customer.
- Browser never chooses authoritative price, freight, total, payment state or customer ownership UUID.
- Mercado Pago remains payment authority.
- Existing orders remain immutable purchase-time snapshots.
- Customer order reads are owner-scoped and private.
- `/pedido/[token]`, guest claim and guest payment must not return.
- Existing Supabase project is evolved in place; already-applied migrations are never reapplied.
- Melhor Envio label purchase is always explicit and fail-closed; no render/webhook/cron/fulfillment event auto-spends.
- Notification failure never mutates financial/fulfillment/shipping truth.
- Store Settings never stores provider/infrastructure secrets.
- Dashboard metrics and Attention Center are read-only and never become a mutation backdoor.
- No merge, squash, rebase, branch deletion or force-move without explicit owner approval.

---

# PHASE 0 — Design + Planning

**State: COMPLETE.**

Approved modular-monolith architecture, branch/checkpoint system and security/payment/fulfillment/customer/catalog boundaries.

# PHASE 1 — Data + Audit Foundation

**State: COMPLETE / APPLIED / VALIDATED.**

Fulfillment state, append-only order events, attention flags and audit foundation are live. Mercado Pago financial authority and concurrency behavior remain preserved.

# PHASE 2 — Admin Orders + Fulfillment

**State: COMPLETE / ACCEPTED.**

`/admin/pedidos`, order detail and `/admin/producao` are implemented with narrow AAL2/same-origin actions, explicit cancellation confirmation and no local payment-state forgery.

# PHASE 3 — Customer Account + Private Owned Orders

**State: COMPLETE / DEPLOYED / PRODUCTION ACCEPTED.**

Verified-account payment start, private account-owned orders, server-derived ownership, owner-scoped list/detail reads, private Mercado Pago returns and durable password recovery are accepted in Production. Guest checkout/payment/public order tracking remain removed.

# PHASE 4 — Database Catalog + Admin Products + Admin Navigation

**State: IMPLEMENTATION COMPLETE / AUTOMATED GREEN / ORIGINAL FULL MANUAL PRODUCTION SMOKE NOT FULLY RE-RUN.**

Supabase `public.products` is the only runtime catalog authority. Product admin supports bounded create/edit/lifecycle operations with `draft | published | archived`, no hard delete, optimistic conflict protection and protected image upload. Global admin navigation is implemented for desktop/mobile.

The historical broad Stage 3 browser checklist remains explicit acceptance debt and is carried into the Phase 9 final manual smoke.

# PHASE 5 — Melhor Envio Shipments + Labels + Tracking

**State: COMPLETE / HOSTED MIGRATIONS APPLIED / PRODUCTION NON-SPENDING PATH VALIDATED / TASK 18 OWNER ACCEPTED / TASK 20 OWNER ACCEPTED.**

Phase 5 provides server-authoritative shipments, explicit preparation/purchase/generation/posting/cancellation, owner-safe customer tracking and a fail-closed Production spending gate.

The safe default remains:

```text
MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false
```

## Phase 5 acceptance evidence preserved

- The controlled Production **non-spending / sem gasto** path reached the real Melhor Envio cart with the local shipment in `in_cart`; the accepted fixture cost was **R$ 23,69**; there was no purchased-order identity and no false `shipped` transition.
- Task 18 **owner accepted** on 2026-09-11 — first explicit real-purchase path **owner-reported** as accepted.
- Task 19 **complete / concluída** — Phase 5 operational documentation reconciled.
- Task 20 **owner accepted** on 2026-09-11 — final Production smoke **owner-reported**.
- Outside deliberate purchase windows, `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` remains mandatory and fail-closed.

Phase 5 migrations preserved:

- `202609080002_melhor_envio_oauth_scope_grants.sql`
- `202609080003_shipments_foundation.sql`
- `202609080004_shipment_operations.sql`
- `202609080005_shipment_cancel_reconciliation.sql`
- `202609080006_customer_shipment_projection.sql`
- `20260909194848_shipments_sender_profile_fk_index.sql`

# PHASE 6 — Transactional Notifications

**State: COMPLETE / HOSTED HARDENING APPLIED / PRODUCTION ACCEPTED / INTEGRATED INTO MAIN.**

Durable outbox + worker + Resend + signed webhook architecture is accepted. Exactly eight transactional types remain supported: `payment_approved`, `production_started`, `ready_to_ship`, `shipped`, `delivered`, `canceled`, `refunded`, `charged_back`.

Open/Click Tracking remain OFF. Notification failure never changes payment, fulfillment or shipment truth. Phase 6 is integrated into `main` via merge `95ac936ca11dfd695734138e579eb97085714980`.

# PHASE 7 — Store Settings

**State: COMPLETE / HOSTED SUPABASE APPLIED + VALIDATED / PRODUCTION ACCEPTED / INTEGRATED INTO MAIN.**

Detailed evidence: `docs/superpowers/phase-7/FINAL_ACCEPTANCE.md`.

Hosted migration: `20260915002740 store_settings`.

Final accepted Phase 7 runtime:

`3fd88688a6cfae343fea3b346a3d1cad1035eb86` — `fix: make store settings globally authoritative`.

GitHub Actions CI #1613 / run `34923612641`: **PASS**.

Phase 7 was integrated into `main`; docs closure commit: `75c78437883627e241a9708c8d07a0988dc8c8b5`.

# PHASE 8 — Dashboard Metrics + Attention Center

**State: IMPLEMENTATION COMPLETE / HOSTED VALIDATED / CANDIDATE DEPLOYED / AUTHENTICATED OWNER SMOKE PENDING.**

Design/spec: `docs/superpowers/specs/2026-09-15-dashboard-metrics-attention-center-design.md`.  
Implementation plan: `docs/superpowers/plans/2026-09-15-dashboard-metrics-attention-center.md`.  
Hosted evidence: `docs/superpowers/phase-8/HOSTED_VALIDATION.md`.

## Implemented/validated scope

- additive migration `supabase/migrations/202609150001_dashboard_metrics_attention_center.sql`;
- hosted migration `20260915092352 dashboard_metrics_attention_center`;
- one read-only `public.admin_get_dashboard_snapshot()` RPC, service-role-only, fixed empty `search_path`;
- one captured `as_of` with calendar boundaries in `America/Sao_Paulo`;
- approved gross and reversals derived independently from trusted Mercado Pago events;
- current fulfillment and payment-risk counts;
- read-only Attention Center by unresolved order/highest severity;
- monthly product ranking from immutable `orders.items` snapshots;
- strict server-only repository/parser with explicit unavailable state and no synthetic zeros;
- `/admin` remains protected/force-dynamic and preserves Melhor Envio utility access.

Hosted reconciliation independently matched all metric categories and introduced no Phase 8 advisor regression.

Runtime rollout candidate:

`773504f0e68220c1bda0ec706c4e62f8d542e433` — `docs: record Phase 8 hosted validation`.

GitHub Actions CI #1631 / run `34960866441`: **PASS**.

The Vercel candidate was deployed. However the owner did not complete the authenticated `/admin` Production smoke; Phase 8 therefore remains **not Production accepted** until that observation is actually performed.

# PHASE 9 — Hardening + Final Rollout

**State: IN PROGRESS / REPOSITORY HARDENING COMPLETE / HOSTED SUPABASE HARDENING VALIDATED / FINAL ROLLOUT + MANUAL ACCEPTANCE PENDING.**

Design/spec: `docs/superpowers/specs/2026-09-15-phase-9-hardening-final-rollout-design.md`.  
Implementation plan: `docs/superpowers/plans/2026-09-15-phase-9-hardening-final-rollout.md`.  
Audit matrix: `docs/superpowers/phase-9/AUDIT_MATRIX.md`.  
Supabase audit: `docs/superpowers/phase-9/SUPABASE_AUDIT.md`.  
Concurrency matrix: `docs/superpowers/phase-9/CONCURRENCY_MATRIX.md`.  
Hosted evidence: `docs/superpowers/phase-9/HOSTED_VALIDATION.md`.  
Manual acceptance checklist: `docs/superpowers/phase-9/FINAL_MANUAL_SMOKE.md`.

## Repository hardening result

- sensitive route/mutation inventory completed;
- auth/customer ownership/origin/rate-limit/cache/secret boundaries preserved;
- no real route security hole demonstrated after correcting audit-test assumptions;
- service-only privileged RPCs remain service-role-only with fixed `search_path`;
- authenticated customer `SECURITY DEFINER` RPCs remain intentional and owner-scoped through `auth.uid()`;
- six advisor `unused_index` findings individually reviewed; no removal met the evidence gate;
- concurrency/idempotency mechanisms consolidated and guarded across payment, preference lease, fulfillment, product/settings revisions, shipments, notifications, recovery grants, attention lifecycle and dashboard snapshot consistency.

Final automated application candidate:

`cdb3f863336237ab49f9b91cca20f0d876aa75c7` — `test: preserve Phase 9 manual acceptance gates`.

GitHub Actions CI #1648 / run `34983376962`: **PASS**. The verify job passed exact Node runtime, frozen install, typecheck, `build`, private-order route contract, startup smoke and full `pnpm test`.

## Hosted Supabase hardening

Only one new Phase 9 DDL migration was required:

- repo: `supabase/migrations/202609150002_phase9_customer_profiles_rls_performance.sql`;
- hosted: `20260915145834 phase9_customer_profiles_rls_performance`.

Result:

- `customer_profiles` RLS ownership semantics unchanged;
- policies now use `(select auth.uid()) = id`;
- three former `auth_rls_initplan` warnings are gone;
- no browser-grant widening;
- six unused-index INFO findings retained after evidence review;
- 16 backend-private `rls_enabled_no_policy` INFO findings remain intentional baseline;
- two authenticated customer `SECURITY DEFINER` WARN findings remain intentional by contract;
- leaked-password protection remains disabled.

Supabase documentation states leaked-password protection is available on Pro and above. Connected tooling for this session does not expose hosted Auth config mutation or project-tier verification, so the setting is **not** claimed enabled and remains `PLATFORM_LIMITATION / OWNER DASHBOARD CHECK`.

## Remaining final gates

1. canonical docs reconciliation + docs-head CI;
2. one exact final Vercel rollout, with normal `umask 022`;
3. restart only from Vercel dashboard, never PM2 CLI;
4. public HTTP health;
5. owner-performed final manual smoke, including inherited Phase 4 and Phase 8 gates;
6. `FINAL_ACCEPTANCE.md` only after actual manual evidence;
7. integration into `main` only by explicit owner approval.

---

## Decisions future chats must not rediscover

1. Architecture is a modular monolith.
2. Admin requires owner UUID + password + mandatory TOTP/AAL2 + active app session.
3. Mercado Pago remains payment authority; fulfillment does not forge financial truth.
4. Payment start requires verified customer identity; guest payment remains removed.
5. Customer order ownership comes only from trusted server identity/Auth UUID.
6. Product authority is Supabase, not a hardcoded runtime catalog.
7. Product lifecycle is exactly `draft | published | archived`; no physical delete.
8. Checkout always re-resolves authoritative current data server-side.
9. Product image write access stays admin-authorized; service secrets never reach browser.
10. Melhor Envio spending is explicit and fail-closed behind `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED`.
11. Preparation, purchase, generation, printing, posting and cancellation are distinct operations.
12. Customer shipment tracking stays authenticated, owner-scoped and sanitized.
13. Hosted Supabase stays separate from Vercel; applied migrations are not reapplied.
14. Vercel Node.js 22.x is the application runtime.
15. Transactional e-mail failure never mutates business truth.
16. Phase 7 Store Settings V1 is allowlisted and provider secrets stay env-only.
17. Dashboard/Attention Center remain read-only.
18. Never remove an index merely to reduce advisor count.
19. Merge/integration/branch deletion are explicit owner decisions.
20. Phase 9 cannot be called complete until the final manual Production smoke actually happens.

## Current checkpoint

**Phase 0:** complete.  
**Phase 1:** complete/applied.  
**Phase 2:** complete/accepted.  
**Phase 3:** complete/deployed/Production accepted.  
**Phase 4:** implementation complete; automated green; broad historical manual smoke pending.  
**Phase 5:** complete/owner accepted.  
**Phase 6:** complete/Production accepted/in `main`.  
**Phase 7:** complete/hosted validated/Production accepted/in `main`.  
**Phase 8:** implementation complete/hosted validated/candidate deployed; authenticated owner smoke pending.  
**Phase 9:** repository + hosted hardening validated; final rollout/manual acceptance pending.

**NEXT EXACT ACTION:** validate the canonical-docs head CI, then deploy the exact final Phase 9 application candidate once to Vercel and execute `FINAL_MANUAL_SMOKE.md`. Do not merge/delete branches without explicit owner approval.
