# ProxyBembem — Current Status

**Updated:** 2026-09-08

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
- Do not merge, squash, rebase, delete or force-move the feature branch without explicit owner choice.

## Accepted runtime invariants

- Catalog browsing, cart editing and freight quotation are public; payment start requires a verified authenticated customer.
- Checkout ownership comes only from the verified Supabase Auth UUID and authoritative confirmed account e-mail.
- Browser values never choose `customer_id`, authoritative product price, freight price or payment total.
- Customer order reads are owner-scoped; private order URLs use `/minha-conta/pedidos/{uuid}`.
- `/pedido/[token]`, guest-claim UI/API/service and guest payment are absent from the active application.
- Mercado Pago remains payment authority; historical order snapshots remain immutable.
- Admin login/MFA/session/no-store protections remain mandatory and unchanged.

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

Final code candidate before documentation reconciliation:

- SHA `2a35d04583eccf0b139815efe26fd4cc04459604`
- GitHub Actions run `34248478882`: PASS
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

Current live product validation after hardening preserved the catalog rows (2 published, 1 archived at validation time).

**Do not reapply any product migration.**

## Supabase advisor classification

Post-DDL advisors showed no new Stage 3 regression. Existing findings remain tracked separately:

- backend-only tables with RLS enabled and no browser policy are intentional where direct browser access is revoked;
- `customer_get_order` / `customer_list_orders` are intentionally authenticated-callable `SECURITY DEFINER` ownership RPCs deriving identity from `auth.uid()`;
- leaked-password protection remains a separate Auth hardening item;
- three `customer_profiles` `auth_rls_initplan` findings are performance optimizations;
- the unused admin-audit index warning is informational at current volume.

Do not weaken accepted authorization merely to silence advisors.

## Final production smoke — DEFERRED BY OWNER

On 2026-09-08 the owner explicitly requested development to continue without running the final browser smoke immediately, because the checks are simple and can be repaired later if a regression is found.

Therefore:

- automated verification and database validation are authoritative and complete;
- **do not claim final Stage 3 browser production acceptance yet**;
- before final production sign-off, deploy the exact final documentation/code branch SHA, restart `proxybembem` from the KingHost panel and run the manual smoke covering login+MFA, desktop/mobile navigation, two order details, production, integration page, product CRUD/image/lifecycle/conflict, storefront/cart/current price, checkout server re-resolution without paid transaction, and logout/cache invalidation.

## Safety gates

- Keep Supabase as the only runtime product authority; do not restore `data/products.ts` as runtime fallback.
- Product lifecycle stays exactly `draft | published | archived`; no hard delete.
- Keep product IDs stable/non-editable and prices in integer cents in storage.
- Checkout product/price/shipping resolution stays server-authoritative.
- Keep admin mutations behind owner UUID + password + TOTP/AAL2 + active app-session.
- Never expose service credentials, provider credentials, recovery tokens, TOTP material, private order UUIDs or customer-private data in Git/chat/logs.
- No real paid Mercado Pago transaction is required for acceptance.
- Broader test-data/account cleanup and legacy schema removal remain separate explicit operations.

## NEXT EXACT ACTION

1. Reconcile the live operational documentation and run fresh CI on the resulting exact SHA.
2. Stop for the owner integration choice: merge to `main`, create a PR, or keep the feature branch as-is.
3. Before treating Stage 3 as fully production-accepted, remind the owner to run the deferred manual production smoke checklist.
4. Do not start Phase 5 automatically before the integration choice.
