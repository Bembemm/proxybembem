# ProxyBembem — Current Status

**Updated:** 2026-09-08

Canonical continuation checkpoint. Detailed intermediate evidence remains in Git history and historical files under `docs/superpowers/plans/` and `docs/superpowers/specs/`. When an old plan/spec conflicts with this file or `ADMIN_DASHBOARD_MASTER_PLAN.md`, this newer operational checkpoint controls.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Primary branch: `feat/admin-dashboard-expansion`
- Base branch: `main`
- Production runtime: KingHost Node.js **22.1.0**
- Backend: hosted Supabase project `ProxyBembem` (`kicgoocozxzkuoqajqif`)
- Canonical deployment runbook: `docs/deployment/kinghost.md`
- Master plan: `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`
- Current Phase 4 implementation plan: `docs/superpowers/plans/2026-09-07-admin-product-catalog-implementation.md`
- Current Phase 4 design: `docs/superpowers/specs/2026-09-07-admin-product-catalog-design.md`
- Phase 3: **COMPLETE — implemented, database-validated, CI-green, deployed to KingHost and production-accepted.**
- Phase 4: **IN PROGRESS — Stage 1 catalog cutover and Stage 2 protected product administration are production-accepted; Stage 3 admin navigation redesign is next.**
- No merge, squash, rebase, branch deletion or force-move has been requested; work continues on the active feature branch.

## Phase 3 accepted model — unchanged

- catalog browsing, cart editing and freight quotation are public;
- starting payment requires a verified authenticated customer;
- checkout ownership comes only from the verified Supabase Auth UUID and authoritative confirmed account e-mail;
- browser values never choose `customer_id`, authoritative product price, freight price or payment total;
- customer order reads are owner-scoped and other-owner UUIDs are indistinguishable from missing orders;
- private order navigation uses `/minha-conta/pedidos/{uuid}`;
- `/pedido/[token]`, guest-claim UI/API/service and public order lookup are absent from the active application;
- Mercado Pago remains payment authority;
- existing orders remain immutable purchase-time snapshots;
- checkout/auth/private/admin responses remain non-cacheable where required.

Durable password recovery, customer order isolation, admin login/MFA, admin order pages and the accepted post-Phase-3 production regression fixes remain part of the current runtime and must not be weakened by Phase 4 work.

## Phase 4 — Stage 1 catalog cutover — COMPLETE / PRODUCTION ACCEPTED

Stage 1 of `2026-09-07-admin-product-catalog-implementation.md` is complete.

### Runtime authority

- `public.products` is now the single runtime source of truth for products.
- Public storefront reads expose only `published` products.
- Checkout resolves current product IDs server-side from Supabase before building the order/payment preference.
- Product prices are stored as integer cents in Postgres and converted only at the domain/UI boundary.
- Shipping metadata is resolved from the current server catalog, never trusted from the browser.
- `/produtos`, home featured products and `GET /api/catalog` all use the Supabase-backed repository.
- Persisted carts keep only `{ productId, quantity }[]`, reconcile against `GET /api/catalog`, adopt current product data and remove IDs no longer published.
- Temporary catalog failure does not erase valid stored cart IDs and does not fall back to stale static prices.
- `data/products.ts` remains only as temporary rollback evidence through Stage 2 acceptance; it must not regain a runtime import.

### Current live products

Hosted Supabase validation confirms:

- ID `1`: `Deck Commander Proxy 100 Cartas`, `published`, original `15000` cents, current `11990` cents, featured;
- ID `2`: `Deck Proxy 60 Cartas`, `published`, original `9999` cents, current `6999` cents.

### Applied Stage 1 migrations

Product catalog:

- Git file: `supabase/migrations/202609070001_product_catalog.sql`
- Supabase history: `20260907184906_product_catalog`

Backend grant repair discovered during the Stage 1 production gate:

- Git file: `supabase/migrations/202609070002_product_catalog_service_role_grants.sql`
- Supabase history: `20260907201707_product_catalog_service_role_grants`

**Do not reapply either migration.**

The grant repair is intentionally least-privilege:

- `service_role`: `SELECT`, `INSERT`, `UPDATE` on `public.products`;
- `service_role`: sequence `USAGE` for generated product IDs;
- no table `DELETE` grant;
- `anon` and `authenticated`: no direct product-table privileges.

Live validation using the `service_role` database role successfully returned the two published product rows after the repair.

### Stage 1 automated evidence

Accepted runtime SHA:

- `a979ee71e607160236135145fe0d773e0bf086ac` — `fix: grant product catalog backend access`
- GitHub Actions run `34158645586`: **PASS**
- exact Node **22.1.0** check: PASS
- frozen pnpm 10 install: PASS
- typecheck: PASS
- KingHost production build: PASS
- private-order route gate: PASS
- KingHost startup smoke: PASS
- tests: **435/435 PASS**

The new grant regression test also passes and requires the service-role table/sequence privilege contract without granting physical delete.

### Stage 1 owner production acceptance — 2026-09-07

After deploying the accepted SHA to KingHost and restarting the managed application, the owner confirmed all required Stage 1 browser checks with normal browser caching enabled:

1. `/produtos` shows both current products with the expected prices;
2. home still renders the Commander product as featured;
3. cart survives reload and reconciles correctly;
4. a valid CEP can calculate freight;
5. an authenticated checkout reaches the Mercado Pago pre-payment flow without requiring a real paid transaction.

This completed the Task 6 production-acceptance checkpoint and unblocked Stage 2.

## Phase 4 — Stage 2 protected product administration — COMPLETE / PRODUCTION ACCEPTED

Stage 2 Tasks 7–12 are complete and production-accepted.

### Accepted capabilities

- product create/update validation is bounded and server-owned;
- new products start as `draft`;
- publishing, archiving and reactivation are explicit lifecycle mutations;
- physical delete is absent;
- archived reactivation returns to `draft`, never directly to `published`;
- optimistic concurrency uses the exact `updated_at` revision and stale saves return stable `409 product_conflict` rather than overwriting newer data;
- all product mutation routes remain behind same-origin checks plus the existing touched owner AAL2/admin-session boundary;
- product image authorization accepts only JPEG/PNG/WebP up to 8 MiB, writes unique immutable paths to `product-images` and never enables overwrite;
- `/admin/produtos`, `/admin/produtos/novo` and `/admin/produtos/[id]` are protected admin surfaces;
- the editor uses explicit save, Brazilian currency input converted to integer cents, repeatable content controls, collapsed shipping details, direct signed Storage upload and explicit lifecycle controls;
- archive requires confirmation;
- unsaved edits warn before unload;
- public storefront and cart continue resolving the current published catalog from Supabase.

### Stage 2 production regression and accepted runtime SHA

The initial Stage 2 deployment exposed a browser navigation-cache regression: after a product lifecycle change, a normal client-side navigation back to the mutable storefront could reuse an older RSC payload even though a full reload returned the current Supabase-backed state.

The accepted production fix keeps the catalog server-authoritative and forces fresh-document navigation only for the mutable storefront destinations `Início` and `Produtos`, avoiding reuse of the stale RSC navigation payload while preserving normal Next navigation elsewhere.

Accepted runtime SHA:

- `32b418383bbdfe1d8d196822025e34adfcd083a1` — `fix: bypass stale RSC cache for catalog navigation`
- GitHub Actions run `34241546616`: **PASS**
- exact KingHost Node **22.1.0** setup/check: PASS
- frozen pnpm install: PASS
- typecheck: PASS
- KingHost production build: PASS
- private-order route contract: PASS
- KingHost startup smoke: PASS
- tests: **474/474 PASS**

The dedicated regression test confirms successful admin product saves/lifecycle changes invalidate the public catalog path and that mutable storefront destinations bypass the soft navigation path that had reproduced the stale RSC payload.

### Stage 2 owner production acceptance — 2026-09-08

After deploying `32b418383bbdfe1d8d196822025e34adfcd083a1` to KingHost and restarting the managed application, the owner confirmed the previously failing real-browser scenario is fixed: after publishing/archiving the Stage 2 test product, navigating normally through the storefront `Produtos` entry reflects the current catalog without a manual refresh.

Together with the preceding Stage 2 production checks, this closes Task 12 and unblocks Stage 3.

No real paid Mercado Pago transaction was required for Stage 2 acceptance.

## Hosted Supabase checkpoint

Do not migrate Supabase to KingHost and do not reapply already-applied migrations.

Previously applied accepted migrations also remain in force:

- `20260902220354_customer_accounts_orders`
- `20260906190757_password_recovery_grants`

The product catalog Storage bucket is `product-images`. Public image read is allowed by bucket posture; public product-image mutation is not.

## Supabase advisor classification

Current findings do not block the accepted catalog/admin rollout:

- `RLS Enabled No Policy` is intentional on `products` and other backend-only tables where direct browser-role privileges are revoked;
- `customer_get_order` / `customer_list_orders` intentionally remain authenticated-callable `SECURITY DEFINER` ownership boundaries deriving identity from `auth.uid()`;
- leaked-password protection remains a separate pre-launch Auth hardening option;
- `customer_profiles` `auth_rls_initplan` findings are performance-only;
- the unused admin-audit index warning is informational at current pre-launch volume.

Do not weaken accepted authorization merely to silence intentional advisor warnings.

## Temporary legacy compatibility

`orders.public_token` and the old `claim_guest_order_for_customer` RPC remain in Postgres only as legacy schema compatibility. Active application code does not use them. Removal belongs to a later explicit pre-launch clean-slate migration after separately approved data cleanup.

## Documentation checkpoint

The earlier Phase 3 operational documentation reconciliation remains complete. Historical plans/specs intentionally remain historical artifacts even when their unchecked boxes or superseded architecture statements no longer describe live state.

This file now supersedes older Master Plan/implementation-plan progress lines that describe Stage 2 as pending. The detailed execution authority for the remaining Phase 4 work is `2026-09-07-admin-product-catalog-implementation.md`.

## KingHost runtime

- application: `proxybembem`
- Node.js: **22.1.0**
- source: `~/apps_nodejs/proxybembem`
- panel entrypoint: `proxybembem/app.js`
- port: KingHost-provided environment variable; never hard-code an allocated port
- canonical runbook: `docs/deployment/kinghost.md`

## Safety gates that remain

- Do not reapply any already-applied migration, including the two product-catalog migrations above.
- Keep Supabase as the only runtime product authority after the accepted cutover.
- Do not restore `data/products.ts` as a runtime fallback; now that Stage 2 is accepted, remove the rollback file in a separate tested commit when no runtime dependency remains.
- Keep product lifecycle exactly `draft | published | archived`; no physical-delete admin flow.
- Archived product reactivation returns to `draft`; publishing remains explicit.
- Keep product IDs stable and non-editable.
- Keep checkout ownership derived only from verified Supabase Auth identity.
- Keep checkout product/price/shipping resolution server-authoritative.
- Keep historical order item snapshots immutable.
- Keep admin mutations behind the existing owner UUID + password + TOTP/AAL2 + active app-session boundary.
- Do not expose the Supabase service credential to browser code.
- Product edits must use optimistic concurrency; stale saves fail rather than silently overwriting newer data.
- Do not restore guest checkout/payment, `/pedido/[token]`, guest-claim application surfaces or browser-selected customer ownership.
- Do not expose secrets, auth credentials, recovery tokens, payment credentials, order UUIDs or customer-private data in Git/chat/logs.
- Broader test-account/test-data deletion remains a separate explicit pre-launch operation.

## NEXT EXACT ACTION

Continue **Stage 3 — Admin navigation redesign**, starting with **Task 13** in `docs/superpowers/plans/2026-09-07-admin-product-catalog-implementation.md`:

1. first remove `data/products.ts` in a separate tested cleanup commit if branch inspection confirms zero runtime dependencies;
2. RED: add `tests/admin-sidebar-ui.test.ts` and update `tests/admin-auth-ui.test.ts` only where the new shared navigation contract requires it;
3. verify the focused RED failure is exactly the missing sidebar/mobile-drawer behavior;
4. implement the desktop persistent/sticky sidebar and mobile dismissible Radix drawer while preserving the existing `AdminShell({ activeSection, title, description, children })` API where practical;
5. keep the fixed sections exactly `Visão geral`, `Pedidos`, `Produção`, `Produtos`, `Integrações`, `Sair`;
6. preserve logout as POST `/api/admin/logout` and all existing admin no-store/session/MFA protections;
7. focused GREEN + typecheck, then full CI;
8. continue to Task 14 only after Task 13 is independently green and reviewed.
