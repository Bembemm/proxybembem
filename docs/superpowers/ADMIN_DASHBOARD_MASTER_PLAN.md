# ProxyBembem Admin Dashboard Expansion — Master Plan

> **Operational source of truth.** Read with `docs/superpowers/CURRENT_STATUS.md`. Historical implementation plans/specs preserve their original RED/GREEN structure and are not retroactively rewritten.

**Goal:** maintain a secure operational store dashboard and private customer account area without weakening checkout, Mercado Pago, Melhor Envio, Supabase or admin authentication.

**Architecture:** modular monolith in the existing Next.js + Supabase application.

**Branch:** `feat/admin-dashboard-expansion`  
**Base:** `main`  
**Runtime:** KingHost Node.js **22.1.0** + hosted Supabase.

## Global invariants

- `/admin` security is authorization/MFA, not URL secrecy.
- Admin access requires the immutable owner Supabase UUID, password, TOTP/AAL2, active server-side admin session, inactivity expiry and fail-closed behavior.
- Customer auth is separate from admin authorization.
- Browsing/cart/freight are public; payment start requires a verified authenticated customer.
- Browser never chooses authoritative product price, freight price, total or customer ownership UUID.
- Mercado Pago remains payment authority.
- Existing orders remain immutable purchase-time snapshots.
- Customer order reads are owner-scoped and private.
- `/pedido/[token]` and guest-claim application surfaces must not return.
- Existing Supabase project is evolved in place; already-applied migrations are never reapplied.
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

`/admin/pedidos`, order detail and `/admin/producao` are implemented with narrow AAL2/same-origin actions, explicit cancellation confirmation and no local payment-state mutation.

# PHASE 3 — Customer Account + Private Owned Orders

**State: COMPLETE / DEPLOYED / PRODUCTION ACCEPTED.**

Current model:

- verified-account payment start;
- private account-owned orders;
- owner identity derived server-side from Supabase Auth;
- customer-safe owner-scoped list/detail RPCs;
- private Mercado Pago returns under `/minha-conta/pedidos/{uuid}`;
- no active guest checkout/payment or public order tracking;
- durable scanner-safe password recovery.

Final accepted Phase 3 runtime: `2945f495ba273055d64251bdd310df3947b629f6`.

# PHASE 4 — Database Catalog + Admin Products + Admin Navigation

**State: IMPLEMENTATION COMPLETE / AUTOMATED GREEN / FINAL MANUAL PRODUCTION SMOKE DEFERRED BY OWNER.**

## Stage 1 — catalog authority — COMPLETE / PRODUCTION ACCEPTED

- Supabase `public.products` is the only runtime catalog authority.
- Published-only public reads.
- Integer-cent prices and server-resolved shipping metadata.
- Storefront/cart/checkout use current server catalog with no static runtime fallback.
- Stage 1 accepted runtime: `a979ee71e607160236135145fe0d773e0bf086ac`.

## Stage 2 — protected product administration — COMPLETE / PRODUCTION ACCEPTED

- protected list/new/edit pages;
- bounded server validation;
- explicit save and lifecycle controls;
- `draft | published | archived` only;
- no hard delete;
- archived reactivation -> draft;
- optimistic conflict protection;
- direct signed image upload to `product-images`, JPEG/PNG/WebP <= 8 MiB, no overwrite;
- public catalog/current-price cache reconciliation.

Stage 2 accepted runtime: `32b418383bbdfe1d8d196822025e34adfcd083a1`.

## Stage 3 — global admin sidebar — IMPLEMENTATION COMPLETE

- desktop persistent/sticky sidebar;
- mobile dismissible Radix drawer;
- sections exactly `Visão geral`, `Pedidos`, `Produção`, `Produtos`, `Integrações`, `Sair`;
- existing protected pages adapted without changing their authorization or operational behavior;
- logout remains POST `/api/admin/logout`;
- no-store/session/MFA semantics preserved.

Final code candidate before docs reconciliation: `2a35d04583eccf0b139815efe26fd4cc04459604`.

Automated evidence: Node 22.1.0, frozen install, typecheck, KingHost build, private-order gate, startup smoke and **483/483 tests PASS**.

Final Supabase validation added/applied `20260908160333_product_catalog_service_role_least_privilege`; effective product table privileges for `service_role` are now only `SELECT/INSERT/UPDATE`, with sequence `USAGE` only. Browser roles have no direct product-table access.

### Remaining Phase 4 gate

The owner explicitly deferred the final manual browser smoke on 2026-09-08 and asked development to continue. This does not invalidate automated evidence, but Phase 4 must not be described as fully browser-production-accepted until that smoke is later run.

Required deferred smoke: login+MFA, desktop/mobile sidebar, orders + two details, production, Melhor Envio integration, products list/create/edit/image/publish/archive/reactivate/conflict, storefront/cart/current price, checkout server re-resolution without real payment, logout/cache invalidation.

# PHASE 5 — Melhor Envio Shipments + Labels + Tracking

**State: NOT STARTED.**

- Re-check current provider API/scopes immediately before implementation.
- Expand OAuth only with explicit least-privilege approval.
- Dedicated shipment model with idempotency/snapshots.
- Flow must keep label purchase explicit; never auto-buy after payment.
- Spending/cancel actions require explicit confirmation.
- Sandbox acceptance before real balance spending capability.

# PHASE 6 — Transactional Notifications

**State: NOT STARTED.**

Production-capable e-mail, outbox/dedupe/retry, order/payment/production/shipping notifications, and admin delivery status. No marketing/automated WhatsApp in the first phase.

# PHASE 7 — Store Settings

**State: NOT STARTED.**

Typed allowlisted operational/commercial settings only. Infrastructure secrets remain env-only.

# PHASE 8 — Dashboard Metrics + Attention Center

**State: NOT STARTED.**

Reliable DB-derived metrics and attention queues; no fabricated metrics.

# PHASE 9 — Hardening + Final Rollout

**State: NOT STARTED.**

Final auth/isolation, origin/rate-limit/secret checks, concurrency matrix, full regression suite, exact rollout SHA and explicit owner rollout approval.

---

## Decisions future chats must not rediscover

1. Architecture is a modular monolith.
2. Admin requires owner UUID + password + mandatory TOTP/AAL2 + active app session.
3. Mercado Pago remains payment authority; fulfillment does not forge financial truth.
4. Payment start requires verified customer identity; guest payment remains removed.
5. Customer order ownership comes only from `auth.uid()`/trusted server identity.
6. Product authority is Supabase, not a hardcoded browser/runtime catalog.
7. Product lifecycle is exactly `draft | published | archived`; no physical delete.
8. Checkout always re-resolves current published product data server-side.
9. Product image write access stays admin-authorized; service secrets never reach the browser.
10. Label spending belongs to Phase 5 and remains explicit.
11. Hosted Supabase stays separate from KingHost; applied migrations are not reapplied.
12. KingHost Node.js 22.1.0 is the application runtime.
13. Integration/merge is an explicit owner decision.
14. Final Phase 4 manual production smoke is deferred, not silently assumed to have happened.

## Current checkpoint

**Phase 0:** complete.  
**Phase 1:** complete/applied.  
**Phase 2:** complete/accepted.  
**Phase 3:** complete/deployed/production-accepted.  
**Phase 4:** implementation complete; automated evidence green; final manual production smoke deferred.  
**Phase 5+:** not started.

**NEXT EXACT ACTION:** finish documentation reconciliation and exact-SHA CI, then stop for owner integration choice. Before final Phase 4 production sign-off, remind the owner to run the deferred browser smoke. Do not auto-start Phase 5.
