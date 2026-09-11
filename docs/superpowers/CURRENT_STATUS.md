# ProxyBembem — Current Status

**Updated:** 2026-09-11

Canonical continuation checkpoint. Historical plans/specs under `docs/superpowers/plans/` and `docs/superpowers/specs/` remain implementation history; when they conflict with this file or `ADMIN_DASHBOARD_MASTER_PLAN.md`, these operational docs control.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Active branch: `feat/admin-dashboard-expansion`
- Base branch: `main`
- Production runtime: KingHost Node.js **22.1.0**
- Backend/Auth: hosted Supabase project `ProxyBembem` (`kicgoocozxzkuoqajqif`)
- Canonical deploy runbook: `docs/deployment/kinghost.md`
- Phase 3 customer account/private orders: **COMPLETE / PRODUCTION ACCEPTED**
- Phase 4 product catalog/admin expansion: **IMPLEMENTATION COMPLETE / AUTOMATED GREEN / FINAL MANUAL PRODUCTION SMOKE DEFERRED BY OWNER**
- Phase 5 Melhor Envio shipments/labels/tracking: **IMPLEMENTED / MIGRATIONS APPLIED / PRODUCTION NON-SPENDING PATH VALIDATED / REAL-SPEND ACCEPTANCE PENDING**
- Do not merge, squash, rebase, delete or force-move the feature branch without explicit owner choice.

## Accepted runtime invariants

- Catalog browsing, cart editing and freight quotation are public; payment start requires a verified authenticated customer.
- Checkout ownership comes only from the verified Supabase Auth UUID and authoritative confirmed account e-mail.
- Browser values never choose `customer_id`, authoritative product price, freight price or payment total.
- Customer order reads are owner-scoped; private order URLs use `/minha-conta/pedidos/{uuid}`.
- `/pedido/[token]`, guest-claim UI/API/service and guest payment are absent from the active application.
- Mercado Pago remains payment authority; historical order snapshots remain immutable.
- Admin login/MFA/session/no-store protections remain mandatory and unchanged.
- Melhor Envio label purchase is never automatic; preparation, purchase, generation, posting and cancellation remain distinct operations.
- `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` remains the Production default until the owner selects a real order and explicitly approves spending.

## Phase 4 — Stage 1 catalog cutover — COMPLETE / PRODUCTION ACCEPTED

- `public.products` is the only runtime product authority.
- Public reads return only `published` products.
- Checkout re-resolves current published product IDs/prices/shipping server-side.
- Storefront, cart reconciliation and `GET /api/catalog` use the Supabase repository with no static runtime fallback.
- Stage 1 accepted runtime: `a979ee71e607160236135145fe0d773e0bf086ac`.
- Stage 1 owner production acceptance completed 2026-09-07.

## Phase 4 — Stage 2 protected product administration — COMPLETE / PRODUCTION ACCEPTED

Accepted behavior:

- create/edit products through protected admin routes;
- lifecycle exactly `draft | published | archived`;
- no physical-delete admin flow;
- reactivate archived products to `draft`;
- optimistic `updated_at` compare-and-swap; stale writes return `409 product_conflict`;
- JPEG/PNG/WebP uploads only, maximum 8 MiB, immutable unique Storage paths and no overwrite;
- explicit save, no autosave, unsaved-change warning and archive confirmation;
- public catalog/cache reconciliation remains server-authoritative.

Stage 2 accepted runtime: `32b418383bbdfe1d8d196822025e34adfcd083a1`. Owner production acceptance completed 2026-09-08, including the stale mutable-storefront navigation regression fix.

## Phase 4 — Stage 3 admin sidebar redesign — IMPLEMENTATION COMPLETE

Implemented and automatically verified:

- persistent/sticky desktop admin sidebar;
- dismissible Radix mobile drawer;
- fixed sections: `Visão geral`, `Pedidos`, `Produção`, `Produtos`, `Integrações`, `Sair`;
- shared shell applied across overview, orders/detail, production, Melhor Envio integration and product management pages;
- logout remains POST `/api/admin/logout`;
- existing owner UUID + password + TOTP/AAL2 + active app-session boundary preserved;
- protected admin responses remain non-cacheable.

Final verified Phase 4 rollout candidate after documentation reconciliation:

- SHA `22d9baba83b181f99e365bf93036ab6bb882654b`
- GitHub Actions run `34267705861`: PASS
- Node **22.1.0**: PASS
- frozen pnpm install: PASS
- typecheck: PASS
- KingHost production build: PASS
- private-order route gate: PASS
- KingHost startup smoke: PASS
- tests: **483/483 PASS**

The production build explicitly contains `/admin`, `/admin/pedidos`, `/admin/pedidos/[id]`, `/admin/producao`, `/admin/integrations/melhor-envio`, `/admin/produtos`, `/admin/produtos/[id]` and `/admin/produtos/novo`.

## Supabase product hardening — APPLIED / VERIFIED

During the final Stage 3 database validation, effective Postgres ACL inspection showed that the earlier product grant migration had added the intended privileges without first removing default `service_role` privileges. A follow-up least-privilege migration was added and applied rather than rewriting migration history.

- Git migration: `supabase/migrations/202609080001_product_catalog_service_role_least_privilege.sql`
- hosted migration history: `20260908160333_product_catalog_service_role_least_privilege`
- `public.products` effective `service_role` privileges: `SELECT`, `INSERT`, `UPDATE` only
- `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`: blocked
- `products_id_seq`: `USAGE` only for `service_role`
- `anon` / `authenticated`: no direct product-table access
- `product-images`: public read posture, 8 MiB max, JPEG/PNG/WebP allowlist

**Do not reapply any product migration.**

## Phase 5 — Melhor Envio shipments, labels, DC-e/DACE and tracking

**State: IMPLEMENTED / HOSTED MIGRATIONS APPLIED / PRODUCTION NON-SPENDING ACCEPTANCE COMPLETE ON CONTROLLED FIXTURE / REAL-SPEND ACCEPTANCE PENDING.**

Implemented runtime behavior:

- exact Phase 5 OAuth grant persisted and enforced: `shipping-calculate`, `cart-read`, `cart-write`, `orders-read`, `shipping-checkout`, `shipping-generate`, `shipping-print`, `shipping-tracking`, `shipping-cancel`;
- encrypted OAuth token authority remains server-only and refresh preserves grants;
- backend-only `shipping_sender_profiles`, `shipments` and `shipment_events` with RLS/revoked browser CRUD;
- PF/CPF + DC-e/DACE current operational path, plus dual-mode foundation for PJ/CNPJ + NF-e;
- fixed sender profile with masked document presentation and origin CEP equality check;
- recipient CPF required, checksum-valid and different from PF sender CPF;
- historical shipment built from immutable order/shipping snapshots, not current catalog state;
- one active non-canceled shipment and one provider package/label per order in V1;
- `Preparar remessa` can insert into the Melhor Envio cart without spending;
- explicit price review before purchase; purchase and generation are separate explicit operations;
- purchase fail-closed behind `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false`;
- no payment webhook, `ready_to_ship`, page render or cron path can auto-buy a label;
- ambiguous checkout/generation/cancel outcomes reconcile rather than blindly retrying;
- label/DACE printing is protected and transient provider resource URLs are not persisted;
- generation/printing never marks an order shipped;
- only explicit posting or trusted carrier acceptance can move `ready_to_ship -> shipped`;
- trusted delivery may move `shipped -> completed`;
- hourly read-only tracking and authenticated customer-safe tracking projection under `/minha-conta/pedidos/{uuid}`;
- explicit cancellation confirmation and no coupling to Mercado Pago refund state.

### Hosted database rollout

Phase 5 migrations were applied to hosted Supabase without rewriting migration history. The applied runtime includes OAuth scope grants, shipment foundation, shipment operations, cancellation reconciliation, customer shipment projection and the sender-profile FK index follow-up. Live ACL/RLS checks confirmed browser roles cannot directly read/write private shipment tables, mutation RPCs remain service-role-only, and customer shipment reads remain ownership-scoped.

Advisor follow-up added `shipments_sender_profile_id_idx`; the new unindexed-FK warning disappeared. Intentional RLS-without-policy warnings remain for backend-only tables, and pre-existing unrelated Auth/performance findings remain tracked separately.

### Production OAuth and sender acceptance

Production OAuth was reauthorized successfully with all nine Phase 5 scopes. The protected integration page showed Production connected, origin CEP `86730-000`, purchase capability disabled, and the PF sender profile was validated with complete safe fields. Full CPF/token values were never exposed during acceptance.

### Production non-spending acceptance

A controlled synthetic paid + `ready_to_ship` fixture was used to validate the no-spend provider path. This does **not** substitute for the later first-real-order spending gate.

Accepted evidence:

- preparation reached the real Production Melhor Envio cart;
- exactly one local shipment exists for the accepted fixture;
- local state is `in_cart`;
- provider cart identity exists, while no provider purchased-order identity exists;
- current label cost was **R$ 23,69**;
- `purchased_cost_cents` remained null;
- no purchase/spend occurred;
- order remained not shipped;
- customer-paid freight versus current provider cost was shown in the admin UI.

The latest pre-documentation implementation checkpoint is SHA `52acb9ba1c85ef05d962504d5923e26a4cef47d4`, GitHub Actions run `34545945878`, with Node 22.1.0 install/typecheck/KingHost build/private-route/startup checks green and **676/676 tests passing**. This SHA is verified as a branch implementation checkpoint; the exact KingHost SHA serving the successful browser preparation was not independently recorded, so do not describe `52acb9...` as a separately proven deployed SHA.

### Task 18 pending — first real label purchase

**Task 18 pending:** the owner must choose one **pedido real**, verify its paid/ready state and recipient data, and explicitly approve enabling real label spending. Until then keep:

```text
MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false
```

When that gate is intentionally opened, the owner must review the current cost, enable the private Production flag, restart through KingHost, click `Comprar etiqueta` once, then use the separate `Gerar etiqueta` action. Unknown checkout outcome must be reconciled before any retry. Real cancellation acceptance is optional and must not destroy a valid label merely to satisfy a checklist.

## Supabase advisor classification

Post-DDL advisors showed no security regression requiring broader grants. Existing/intentional findings remain tracked separately:

- backend-only tables with RLS enabled and no browser policy are intentional where direct browser access is revoked;
- `customer_get_order` / `customer_list_orders` are intentionally authenticated-callable `SECURITY DEFINER` ownership RPCs deriving identity from `auth.uid()`;
- leaked-password protection remains a separate Auth hardening item;
- `customer_profiles` `auth_rls_initplan` findings remain performance optimizations;
- unused newly-created indexes can be informational at current volume.

Do not weaken accepted authorization merely to silence advisors.

## Phase 4 final browser smoke — still nuanced

The owner deferred the original full Phase 4 browser smoke on 2026-09-08. Later Phase 5 work exercised significant portions of the protected admin/order/integration runtime successfully, but this does not retroactively prove every item in the old Stage 3 checklist (notably every product CRUD/image/conflict path and the previously omitted authenticated cache-header observation).

Therefore keep Phase 4 wording factual: automated evidence is green and multiple protected Production surfaces were used during Phase 5, but do not claim the entire old Stage 3 browser checklist was independently re-run unless it actually is.

## Safety gates

- Keep Supabase as the only runtime product authority; do not restore `data/products.ts` as runtime fallback.
- Product lifecycle stays exactly `draft | published | archived`; no hard delete.
- Checkout product/price/shipping resolution stays server-authoritative.
- Keep admin mutations behind owner UUID + password + TOTP/AAL2 + active app-session.
- Never expose service credentials, provider credentials, recovery tokens, TOTP material, full tax documents, private order UUIDs or customer-private data in Git/chat/logs.
- Keep `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` until explicit approval for the first real order.
- Never infer a successful label purchase from an HTTP timeout; reconcile first.
- Purchase/generation/printing do not mark a customer order shipped.
- Broader test-data/account cleanup and legacy schema removal remain separate explicit operations.

## NEXT EXACT ACTION

1. Finish Task 19 documentation reconciliation and run the exact-SHA verification required by Task 20.
2. Keep **Task 18 pending** until the owner selects a **pedido real** and explicitly approves the real-spend gate.
3. Until that approval, keep `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false`; do not spend merely to complete acceptance.