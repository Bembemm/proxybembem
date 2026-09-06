# ProxyBembem — Current Status

**Updated:** 2026-09-06

Canonical continuation checkpoint. Detailed intermediate evidence remains in Git history and historical files under `docs/superpowers/plans/` and `docs/superpowers/specs/`. When an old plan/spec conflicts with this file or `ADMIN_DASHBOARD_MASTER_PLAN.md`, the newer operational checkpoint controls.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Primary branch: `feat/admin-dashboard-expansion`
- Base branch: `main`
- Production runtime: KingHost Node.js **22.1.0**
- Backend: hosted Supabase project `ProxyBembem` (`kicgoocozxzkuoqajqif`)
- Canonical deployment runbook: `docs/deployment/kinghost.md`
- Master plan: `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`
- Authenticated checkout/private orders design: `docs/superpowers/specs/2026-09-06-authenticated-checkout-private-orders-design.md`
- Durable password recovery design: `docs/superpowers/specs/2026-09-05-password-recovery-durable-grant-design.md`
- State: **PHASE 3 COMPLETE — implemented, database-validated, CI-green, deployed to KingHost and production-accepted.**
- Phase 4: **unblocked but not started; do not begin automatically before the owner chooses branch integration handling.**

## Phase 3 production acceptance — COMPLETE

Verified end-to-end on KingHost:

1. anonymous customers can build the cart, fill customer/address data and quote/select freight;
2. starting payment while signed out saves a bounded same-tab checkout draft, closes the cart drawer and navigates to `/entrar?next=%2Fprodutos`;
3. the login page stays clean — the saved draft does not reopen the global cart on `/entrar`;
4. password login persists the Supabase SSR session directly in response cookies;
5. after login, `/produtos` restores checkout fields and requests a **fresh** freight quote; the previous signed quote token is never reused;
6. authenticated `POST /api/checkout` succeeds without the earlier production `401 Unauthorized`;
7. checkout creates an order using the verified authenticated `customer_id` and authoritative confirmed account e-mail;
8. Mercado Pago preference/checkout URL creation succeeds without requiring a real paid transaction for acceptance;
9. Mercado Pago return URLs target `/minha-conta/pedidos/{order-id}`;
10. Account A can open its own private order;
11. Account B opening Account A's exact order UUID receives not-found/404 behavior with no order/customer data;
12. `/pedido/<token>`-shaped URLs return not-found/404 with no private data;
13. fresh durable password recovery, password update and subsequent login succeed in production; replay/reuse fails closed;
14. acceptance-only synthetic orders were removed after validation.

The browser-level acceptance therefore confirms the same isolation already validated directly against the `customer_get_order(uuid)` RPC.

## Current checkout/private-order model

- catalog, cart and freight quote are public;
- payment start requires a verified authenticated customer;
- browser-supplied customer IDs never choose ownership;
- verified account e-mail is authoritative;
- checkout-attempt reuse is same-owner only;
- customer order reads are owner-scoped and other-owner UUIDs are indistinguishable from missing orders;
- private order navigation uses `/minha-conta/pedidos/{uuid}`;
- `/pedido/[token]`, guest-claim UI/API/service, public order lookup and `account-claim` rate-limit scope are absent from the active application;
- checkout/auth/private responses remain non-cacheable where required.

### Production regressions resolved during acceptance

1. **checkout draft lost through login** — fixed with bounded same-tab `sessionStorage` for at most 30 minutes; only selected freight service ID is remembered and freight is freshly quoted after login;
2. **cart drawer reopened over login** — draft restoration may open the cart only on `/produtos`, never on `/entrar`;
3. **authenticated checkout returned 401 after login** — login now owns SSR auth-cookie creation and `/api/checkout` participates in Supabase session refresh.

All three are covered by regression tests.

## CI evidence

Final deployed runtime code:

- commit `2945f495ba273055d64251bdd310df3947b629f6` — `fix: restore checkout cart only on products`
- CI run `34061829912`: **PASS**
- exact Node 22.1.0 check: PASS
- frozen install: PASS
- typecheck: PASS
- KingHost build: PASS
- production route-manifest privacy gate: PASS
- startup smoke: PASS
- tests: **406/406 PASS**

Production-acceptance documentation checkpoint:

- commit `f50a7e1a9bf734d97860a722c861588d267e47a5`
- CI: **PASS**
- tests: **406/406 PASS** plus typecheck/KingHost build/private-route gate/startup smoke.

Documentation reconciliation verification:

- verified documentation candidate: `639626f706fe29b41f47e878823c652352c31d87`
- CI run `34065723232`: **PASS**
- exact Node 22.1.0 check: PASS
- frozen install: PASS
- typecheck: PASS
- KingHost build: PASS
- production route-manifest privacy gate: PASS (`private-order-route-contract-ok`)
- startup smoke: PASS
- tests: **406/406 PASS**
- diff from `f50a7e1a9bf734d97860a722c861588d267e47a5`: only five operational Markdown files changed; no runtime code, tests, migrations or executable configuration changed.

The permanent CI route gate fails if a production route begins with `/pedido/` or if `/minha-conta/pedidos/[id]/page` disappears.

## Hosted Supabase checkpoint

Do not migrate Supabase to KingHost and do not reapply already-applied migrations.

Applied Phase 3 migration:

- Git file: `supabase/migrations/202609020003_customer_accounts_orders.sql`
- Supabase history: `20260902220354_customer_accounts_orders`
- rollback-only validation matrix: **10/10 PASS**

Applied durable password-recovery migration:

- Git file: `supabase/migrations/202609050001_password_recovery_grants.sql`
- Supabase history: `20260906190757_password_recovery_grants`
- RLS/direct privilege/RPC security validation: PASS
- fresh KingHost end-to-end recovery acceptance: PASS

Do **not** reapply either migration.

## Synthetic acceptance cleanup

Two production-acceptance orders were deleted by exact UUID only after confirming both were pending/awaiting-payment, had no `payment_id` and had no related events/attention rows. Verification returned zero remaining acceptance orders.

No Auth user was deleted. Broader all-test-account/all-test-data cleanup remains a separate explicit pre-launch operation.

## Supabase advisor classification

Current advisor findings do not block Phase 3 completion:

- `RLS Enabled No Policy` is intentional on backend-only tables where direct privileges are revoked;
- `customer_get_order`/`customer_list_orders` intentionally use authenticated-callable `SECURITY DEFINER` boundaries deriving ownership from `auth.uid()` and passed DB + browser isolation acceptance;
- leaked-password protection is a separate pre-launch Auth hardening option;
- `customer_profiles` has a performance-only `auth_rls_initplan` warning that can be optimized later;
- the unused admin-audit index warning is informational at current pre-launch volume.

Do not weaken accepted authorization merely to silence intentional advisor warnings.

## Temporary legacy database compatibility

`orders.public_token` and the old `claim_guest_order_for_customer` RPC remain in Postgres only because the current schema still carries them.

They are **legacy schema only**:

- active application navigation does not use `public_token`;
- Mercado Pago return URLs do not use it;
- public `/pedido/[token]` routing is absent;
- guest claim UI/API/service is absent.

Removal belongs to a later explicit pre-launch clean-slate migration after a broader test-data cleanup. Do not reintroduce application dependencies on them.

## Documentation reconciliation — COMPLETE

After Phase 3 acceptance, all repository Markdown was reviewed. Historical plans/specs remain unchanged as historical artifacts; their old checkboxes and superseded architecture statements are not live tasks.

Operational documentation was reconciled on `feat/admin-dashboard-expansion`:

- `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md` records Phase 3 as complete and the authenticated/private-order model as current;
- `docs/superpowers/README.md` points to the active branch, KingHost runtime and supersession rules;
- `docs/payments-setup.md` documents KingHost, authenticated payment start and private `/minha-conta/pedidos/{uuid}` returns instead of Vercel/`/pedido/<token>`;
- `docs/shipping-setup.md` documents KingHost Cron/OAuth operation, manual Supabase admin recovery, and independent Production secrets instead of Vercel Cron/Preview as current runtime;
- this `CURRENT_STATUS.md` records the completed reconciliation so future sessions do not reopen Phase 3 from historical Markdown.

The reconciliation candidate passed the full CI matrix at `639626f706fe29b41f47e878823c652352c31d87` / run `34065723232` with **406/406 tests**. These are documentation-only changes and do **not** require a KingHost redeploy.

## KingHost runtime

- application: `proxybembem`
- Node.js: **22.1.0**
- source: `~/apps_nodejs/proxybembem`
- panel entrypoint: `proxybembem/app.js`
- port: KingHost-provided environment variable; never hard-code an allocated port
- canonical runbook: `docs/deployment/kinghost.md`

## Branch/integration gate

`feat/admin-dashboard-expansion` remains the active completed Phase 3 feature branch.

Do not merge, squash, rebase, delete or force-move it without the owner's explicit integration choice.

## Safety gates that remain

- Do not reapply Phase 1/2/3 migrations or `password_recovery_grants`.
- Keep checkout ownership derived only from verified Supabase Auth identity.
- Do not restore guest checkout/payment, `/pedido/[token]`, guest-claim application surfaces or browser-selected customer ownership.
- Keep customer reads owner-scoped and other-owner UUIDs indistinguishable from missing orders.
- Keep provider production-environment safety enabled.
- Do not expose secrets, auth credentials, recovery tokens, payment credentials, order UUIDs or customer-private data in Git/chat/logs.
- Broader test-account/test-data deletion is a separate pre-launch operation requiring an explicit scoped cleanup decision.

## NEXT EXACT ACTION

1. Owner chooses branch integration handling for `feat/admin-dashboard-expansion`: merge into `main`, create a PR, or keep the branch as-is.
2. Only after that choice, begin Phase 4 or a separately approved pre-launch clean-slate/hardening operation.
