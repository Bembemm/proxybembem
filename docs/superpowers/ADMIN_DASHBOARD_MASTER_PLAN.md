# ProxyBembem Admin Dashboard Expansion — Master Plan

> **Operational source of truth.** Read with `docs/superpowers/CURRENT_STATUS.md`. Historical implementation plans/specs preserve their original RED/GREEN structure and are not retroactively rewritten.

**Goal:** maintain a secure operational store dashboard and private customer account area without weakening checkout, Mercado Pago, Melhor Envio, Supabase or admin authentication.

**Architecture:** modular monolith in the existing Next.js + Supabase application.

**Branch:** `feat/transactional-notifications`  
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
- Melhor Envio label purchase is always explicit and fail-closed; no payment/fulfillment/render/cron event auto-spends.
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

**State: IMPLEMENTATION COMPLETE / AUTOMATED GREEN / ORIGINAL FULL MANUAL PRODUCTION SMOKE NOT FULLY RE-RUN.**

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

Automated evidence at that checkpoint: Node 22.1.0, frozen install, typecheck, KingHost build, private-order gate, startup smoke and **483/483 tests PASS**.

The old full Stage 3 browser smoke was deferred by the owner on 2026-09-08. Phase 5 later exercised admin/order/integration surfaces in Production, but do not reinterpret that as proof that every old product CRUD/image/conflict/cache item was manually re-run.

# PHASE 5 — Melhor Envio Shipments + Labels + Tracking

**State: COMPLETE / HOSTED MIGRATIONS APPLIED / PRODUCTION NON-SPENDING PATH VALIDATED / TASK 18 OWNER ACCEPTED / TASK 20 OWNER ACCEPTED.**

Phase 5 provides a production-capable server-authoritative shipment subsystem while preserving the no-auto-spend rule.

## Implemented architecture

- persisted least-privilege OAuth grant for exactly:
  - `shipping-calculate`
  - `cart-read`
  - `cart-write`
  - `orders-read`
  - `shipping-checkout`
  - `shipping-generate`
  - `shipping-print`
  - `shipping-tracking`
  - `shipping-cancel`
- backend-only sender, shipment and shipment-event persistence;
- one active non-canceled shipment per order;
- immutable recipient/sender/package/declaration snapshots;
- current PF/CPF + DC-e/DACE operational path;
- fixed sender profile and origin-CEP equality requirement;
- recipient CPF validation and sender/recipient CPF distinction;
- support foundation for PJ/CNPJ + NF-e without weakening the PF flow;
- durable operation claims and idempotent/reconcilable provider mutations;
- exact checkout-selected service preserved; no silent carrier/service substitution;
- V1 supports exactly one provider package/volume and one label per active order;
- admin-safe masked sender/tax identity and cost comparison;
- customer-owned sanitized tracking projection only under `/minha-conta/pedidos/{uuid}`;
- no public tracking endpoint exposing shipment internals.

## Explicit operation model

The admin flow is intentionally segmented:

```text
Preparar remessa -> revisar custo -> Comprar etiqueta -> Gerar etiqueta -> imprimir -> Postar -> rastrear
```

Preparation may add a shipment to the Melhor Envio cart but does not purchase it. Purchase is a separate explicit confirmed operation. Generation is also separate. Generation/printing never mark the order shipped. Only explicit posting or trusted carrier acceptance may move `ready_to_ship -> shipped`; trusted delivery may move `shipped -> completed`.

Cancellation is explicit and confirmed. Ambiguous purchase/generation/cancel results never cause a blind second provider mutation; reconciliation must resolve uncertain outcomes first.

## Production spending gate

Production label checkout is enabled only inside a deliberate owner-approved purchase window by setting:

```text
MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=true
```

The safe default outside deliberate purchase windows remains:

```text
MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false
```

With the flag false, checkout/spending stops before a provider purchase call. No webhook, `ready_to_ship`, page render, tracking cron or retry path is allowed to auto-enable or bypass this gate.

## Hosted Supabase rollout

The Phase 5 migration series and the sender-profile FK index follow-up were applied and validated against the hosted project. Browser roles have no direct private shipment-table CRUD. Mutation RPCs remain fixed-`search_path`, `SECURITY DEFINER`, service-role-only. Customer projection access remains owner-derived from `auth.uid()` and excludes CPF, sender snapshot, provider cost/IDs and transient print resources.

## Production non-spending acceptance

Production OAuth was reauthorized with all nine Phase 5 scopes and a complete PF sender profile was configured. The safe path was exercised against a controlled synthetic paid + ready-to-ship fixture.

Verified acceptance evidence:

- successful Production cart insertion;
- exactly one remessa for the accepted fixture;
- shipment state `in_cart`;
- provider cart identity present;
- no provider purchased-order identity;
- current provider label cost **R$ 23,69**;
- purchased cost still null;
- no real label purchase/spend in that controlled acceptance;
- no shipped transition caused by preparation.

Latest pre-documentation green implementation checkpoint: `52acb9ba1c85ef05d962504d5923e26a4cef47d4`; CI run `34545945878` passed Node 22.1.0 setup, frozen install, typecheck, KingHost build, private-order contract, startup smoke and **676/676 tests**. It is a verified branch checkpoint; do not claim it was independently recorded as the exact SHA serving the successful browser action.

## Task 19 — documentation reconciliation — COMPLETE

Task 19 is complete. The canonical operational documents match the accepted Phase 5 architecture, hosted migration rollout, independently observed non-spending evidence and fail-closed spending controls without fabricating provider evidence.

## Task 18 — first explicit real purchase — OWNER ACCEPTED

**Task 18 owner accepted on 2026-09-11.** The owner explicitly reported that the live purchase flow had been tested and instructed that Task 18 be closed. This is **owner-reported manual acceptance**; it is not an independently captured provider trace, and the operational record does not invent an unobserved order number, cost, provider order ID, label-generation artifact, posting event or tracking event.

The independently recorded no-spend acceptance remains the controlled fixture above. The later owner-reported Task 18 acceptance closes the remaining real-order rollout gate at the owner-acceptance level without rewriting that historical evidence.

Future label purchases remain explicit and fail-closed. Outside an intentional purchase window:

```text
MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false
```

When a purchase window is intentionally opened, current paid/ready state, recipient data, sender profile and current provider price must still be reviewed. Unknown checkout outcomes must be reconciled before any retry.

Direct Production staging remains the accepted rollout strategy; Sandbox is not a prerequisite for the accepted live flow.

## Task 20 — final verification / handoff — OWNER ACCEPTED

**Task 20 owner accepted on 2026-09-11.** The owner deployed runtime candidate `fa3ce232ad2e5e5b8ad669a348492555cb068295`, restarted the KingHost application, completed the requested Production smoke and reported **“tudo certo”**. This is **owner-reported manual Production acceptance**, not independently captured browser evidence.

The smoke covered admin login/TOTP, Production Melhor Envio integration visibility, a normal order-detail load, and logout/login behavior. The same exact runtime candidate had GitHub Actions run `34611501313` complete successfully with Node 22.1.0 setup, frozen install, typecheck, KingHost build, private-order route contract, startup smoke and the full automated suite green.

The historical authenticated admin response-header observation was not separately captured from the owner browser in this final smoke. Automated regression coverage still enforces no-store behavior for protected admin responses. Carry the manual header observation into later hardening rather than fabricating evidence that it was observed.

Phase 5 is complete at the owner-handoff level. Later provider/runtime incidents are operational fixes and do not automatically reopen Task 18 or Task 20.

# PHASE 6 — Transactional Notifications

**State: COMPLETE / HOSTED HARDENING APPLIED / AUTOMATED GREEN / PRODUCTION ACCEPTED.**

Phase 6 provides production-capable transactional e-mail without coupling provider failures to payment, fulfillment or shipment truth.

## Implemented architecture

- durable backend-only Supabase outbox with immutable customer-safe template payloads;
- exactly eight notification types: `payment_approved`, `production_started`, `ready_to_ship`, `shipped`, `delivered`, `canceled`, `refunded`, `charged_back`;
- no order e-mail before authoritative payment approval, including no cancellation message for an order that never had an approved Mercado Pago event;
- deterministic database dedupe plus stable Resend `Idempotency-Key` across automatic retries;
- shared server-side Resend transport with fixed sender `ProxyBembem <noreply@proxybembem.com.br>`;
- worker protected by the existing `CRON_SECRET`, max batch 25, max three automatic attempts, retry around +5 minutes and +30 minutes;
- signed Svix/Resend webhook processing only for `email.sent`, `email.delivered`, `email.bounced`, `email.failed`, `email.suppressed`;
- no opening/click tracking;
- Mercado Pago remains financial authority for approved/refunded/charged-back events;
- Phase 5 shipment events remain shipping authority; label purchase/generation never fabricate a shipped e-mail;
- delivered e-mail requires trusted carrier delivery evidence, not generic admin completion;
- protected admin order detail exposes sanitized e-mail history plus explicit audited manual resend;
- manual resend creates a distinct linked delivery and never rewrites the historical result;
- notification failure never mutates payment, fulfillment or shipment state;
- late provider events are linked by trusted provider message ID even when monotonic terminal-state rules correctly prevent a status downgrade.

## Hosted Supabase rollout

The complete Phase 6 migration series is applied in hosted Supabase:

- `20260913011820 transactional_notifications_foundation`;
- `20260913011838 transactional_notification_triggers`;
- `20260913013454 transactional_notification_advisor_indexes`;
- `20260913022001 transactional_notification_webhook_reconciliation`;
- `20260914180352 transactional_notification_final_hardening`;
- `20260914181035 transactional_notification_webhook_backfill`.

Live validation confirms:

- `notification_outbox` and `notification_webhook_events` have RLS enabled;
- `anon` and ordinary `authenticated` have no direct outbox CRUD;
- worker/mutation RPCs remain service-role-only with fixed empty `search_path`;
- `order_events` and `shipment_events` enqueue triggers are installed;
- callback completion/webhook paths retain consistent provider-message advisory lock ordering;
- previously early callbacks reconcile after provider-ID persistence;
- late/stale callbacks cannot downgrade a stronger terminal state but remain audit-linked;
- post-DDL advisors show no new Phase 6 grant exposure or unindexed-FK regression.

Final rollback-only hosted validation after the last hardening proved:

- pending/unpaid order + admin cancellation -> zero notification intents;
- prior authoritative Mercado Pago approval + admin cancellation -> both `payment_approved` and `canceled` intents;
- late `email.sent` for a delivered message -> provider event links to the correct notification while status stays `delivered`;
- the one historical webhook row that already had a known provider-message match but lacked `notification_id` was backfilled, moving the live orphan count from 1 to 0.

## Production acceptance

Production acceptance completed on 2026-09-14 against the already-deployed KingHost runtime `c8c2bb20f1c265729c4d4aee7fe65a91e2e1cc4c`:

- direct KingHost cron URL is `https://www.proxybembem.com.br/api/internal/notifications/process`, every 5 minutes; KingHost uses GET and the route also supports controlled POST diagnostics;
- Resend domain is verified in `sa-east-1`, sending enabled, Open Tracking OFF and Click Tracking OFF;
- webhook is enabled at `https://www.proxybembem.com.br/api/webhooks/resend` for exactly the five operational events;
- a controlled `production_started` e-mail completed `pending -> sent -> delivered` through worker, Resend and signed webhook;
- protected admin history showed the delivery result;
- explicit manual resend created a new linked delivery and also reached `delivered`.

The two final behavior fixes are database-function changes already applied through additive hosted migrations. They did not require a new KingHost application deploy because the deployed app runtime already contains the accepted worker, webhook, templates, admin history/resend and GET-cron compatibility.

## Automated verification

Final implementation/backfill checkpoint before final status-document reconciliation: `caf1090cd3963d576d324e8ada6be70b83481027`; GitHub Actions run `34878962739` / run #1523: **PASS**.

That run passed:

- exact KingHost Node **22.1.0** runtime gate;
- frozen pnpm install;
- typecheck;
- KingHost production build;
- private-order route contract;
- KingHost startup smoke;
- full automated test suite.

Phase 6 is complete and production-accepted. Do not merge PR #4 without explicit owner approval.

# PHASE 7 — Store Settings

**State: NOT STARTED.**

Typed allowlisted operational/commercial settings only. Infrastructure secrets remain env-only.

# PHASE 8 — Dashboard Metrics + Attention Center

**State: NOT STARTED.**

Reliable DB-derived metrics and attention queues; no fabricated metrics.

# PHASE 9 — Hardening + Final Rollout

**State: NOT STARTED.**

Final auth/isolation, origin/rate-limit/secret checks, concurrency matrix, full regression suite, exact rollout SHA and explicit owner rollout approval. The manual authenticated admin cache-header observation that was not separately captured during the Phase 5 owner smoke remains suitable for this hardening pass.

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
10. Phase 5 label spending is implemented, explicit and fail-closed behind `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED`; the safe default outside deliberate purchase windows is false.
11. Preparation, purchase, generation, posting and cancellation are separate operations; no auto-spend.
12. Customer shipment tracking stays authenticated, owner-scoped and sanitized.
13. Hosted Supabase stays separate from KingHost; applied migrations are not reapplied.
14. KingHost Node.js 22.1.0 is the application runtime.
15. Phase 6 uses durable outbox + bounded retries + signed Resend delivery webhooks; provider e-mail failure never changes order/payment/shipment truth.
16. Phase 6 has exactly eight transactional types and no open/click tracking or automated marketing/WhatsApp scope.
17. Integration/merge is an explicit owner decision.
18. The old full Phase 4 Stage 3 browser checklist remains partially deferred; Phase 5 Production use does not fabricate missing evidence.

## Current checkpoint

**Phase 0:** complete.  
**Phase 1:** complete/applied.  
**Phase 2:** complete/accepted.  
**Phase 3:** complete/deployed/production-accepted.  
**Phase 4:** implementation complete; automated evidence green; original broad manual Stage 3 checklist not fully re-run.  
**Phase 5:** complete at owner-handoff level; hosted DB applied; Production non-spending path validated to `in_cart` at **R$ 23,69**; **Task 19 complete**; **Task 18 owner accepted by owner-reported manual acceptance**; **Task 20 owner accepted by owner-reported Production smoke**; `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` remains the safe default outside deliberate purchase windows.  
**Phase 6:** complete; hosted schema + final hardening/backfill applied; automated CI green; Production Resend webhook + KingHost cron + live e-mail/admin resend accepted.  
**Phase 7+:** not started.

**NEXT EXACT ACTION:** no Phase 6 task remains open. The owner chooses separately whether to integrate PR #4 or begin Phase 7 — Store Settings. Keep PR #4 draft and do not merge/squash/rebase/delete the branch without explicit owner approval.
