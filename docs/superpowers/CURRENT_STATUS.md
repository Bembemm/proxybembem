# ProxyBembem — Current Status

**Updated:** 2026-09-06

Canonical continuation checkpoint. Detailed intermediate evidence remains in Git history and in `docs/superpowers/plans/`; this file records the current verified state and exact resume action.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Primary branch: `feat/admin-dashboard-expansion`
- Base branch: `main`
- Phase 3 plan: `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
- Authenticated checkout/private orders design: `docs/superpowers/specs/2026-09-06-authenticated-checkout-private-orders-design.md`
- Authenticated checkout/private orders plan: `docs/superpowers/plans/2026-09-06-authenticated-checkout-private-orders.md`
- Durable password recovery design: `docs/superpowers/specs/2026-09-05-password-recovery-durable-grant-design.md`
- Durable password recovery plan: `docs/superpowers/plans/2026-09-05-password-recovery-durable-grant.md`
- State: **PHASE 3 COMPLETE. Tasks 1–14 are implemented, database-validated, CI-green, deployed to KingHost, and production-accepted.**
- Phase 4: **unblocked, but do not start automatically before the owner chooses how to integrate/preserve the completed feature branch.**

## Phase 3 production acceptance — COMPLETE

The final production acceptance was completed on KingHost on 2026-09-06.

Verified end-to-end behavior:

1. anonymous customers can build the cart, fill customer/address data and quote/select freight;
2. starting payment while signed out saves the bounded same-tab checkout draft, closes the cart drawer, and navigates to `/entrar?next=%2Fprodutos`;
3. the login page remains clean: the saved checkout draft does not reopen the global cart drawer on `/entrar`;
4. password login persists the Supabase SSR session directly in response cookies and performs a full same-origin continuation only after the cookie-bearing response completes;
5. after login, `/produtos` restores the cart/form and requests a fresh freight quote; the old signed freight quote token is never reused;
6. authenticated `POST /api/checkout` succeeds without the previously observed `401 Unauthorized`;
7. checkout creates an order with the verified authenticated `customer_id` and authoritative confirmed account e-mail;
8. Mercado Pago preference creation and checkout URL generation succeed; no real paid transaction was required for acceptance;
9. Mercado Pago return URLs target `/minha-conta/pedidos/{order-id}`;
10. Account A can open its private order detail through `Minha Conta > Pedidos`;
11. Account B opening Account A's exact private order URL receives not-found/404 behavior with no private order/customer data;
12. a legacy `/pedido/<token>`-shaped URL returns not-found/404 and exposes no order/customer data;
13. a fresh durable password-recovery request, new link, password reset and subsequent login with the new password all succeed in production;
14. synthetic order fixtures created solely for acceptance were removed after the checks passed.

Task 14 is therefore **COMPLETE**.

## Authenticated checkout and private-order model

The production model is now:

- catalog, cart and freight quote remain public;
- payment start requires a verified authenticated customer;
- checkout ownership is derived only from the verified Supabase Auth user;
- browser-supplied customer IDs never choose ownership;
- verified account e-mail is authoritative;
- checkout-attempt reuse is same-owner only;
- customer order reads are owner-scoped and other-owner UUIDs are indistinguishable from missing orders;
- private order navigation uses `/minha-conta/pedidos/{uuid}`;
- `/pedido/[token]`, guest claim UI/API/service, public order lookup and the `account-claim` rate-limit scope are absent from the active application;
- checkout/auth/private responses remain non-cacheable where required.

### Login handoff regression history

Two production regressions discovered during Task 14 are resolved and covered by regression tests:

1. **checkout draft lost through login:** checkout customer/address/freight state now uses bounded same-tab `sessionStorage` for at most 30 minutes; only the selected freight service ID is remembered and freight is freshly quoted after login;
2. **cart drawer reopened over login:** draft restoration may reopen the cart only on `/produtos`, never on `/entrar`.

The earlier authenticated checkout `401` was also resolved by replacing the split browser/server auth handoff with server-owned SSR auth cookies and adding `/api/checkout` to the Supabase session-refresh proxy matcher.

## CI evidence

Final deployed runtime code:

- commit `2945f495ba273055d64251bdd310df3947b629f6` — `fix: restore checkout cart only on products`
- CI run `34061829912`: **PASS**
- exact KingHost Node 22.1.0 setup/version check: PASS
- frozen install: PASS
- typecheck: PASS
- KingHost build: PASS
- production route-manifest privacy gate: PASS
- startup smoke: PASS
- tests: **406/406 PASS**

Production-acceptance progress checkpoint:

- commit `51815f788c9fa0138f7864159f597749427bb852` — `docs: record production checkout acceptance progress`
- CI run `34064472567`: **PASS**
- typecheck/build/private-route gate/startup smoke: PASS
- tests: **406/406 PASS**

The permanent CI route gate fails if a production route begins with `/pedido/` or if `/minha-conta/pedidos/[id]/page` disappears.

## Live database authorization evidence

A production database check used two different already-confirmed Auth identities against the actual `public.customer_get_order(uuid)` RPC:

- owner identity -> non-null order payload;
- different confirmed identity -> null.

The RPC derives ownership from `auth.uid()` and filters by both order UUID and `customer_id`. Browser-level Account A/Account B acceptance independently passed afterward.

## Synthetic acceptance cleanup

Two orders created solely during the production acceptance sequence were identified before deletion. Both were:

- `payment_status = pending`;
- `fulfillment_status = awaiting_payment`;
- `payment_id IS NULL`;
- owned by an authenticated customer;
- backed by a Mercado Pago preference/checkout URL;
- referenced by zero `order_events` rows;
- referenced by zero `order_attention_flags` rows.

They were deleted by exact UUID under a guarded transaction requiring the pending/unpaid state. Verification after commit returned **0 remaining acceptance orders**.

No Auth user was deleted as part of this narrow cleanup. Broader all-test-account/all-test-data cleanup remains a separate explicit pre-launch operation.

## Hosted Supabase checkpoint

Hosted project: `ProxyBembem` (`kicgoocozxzkuoqajqif`).

Do not migrate Supabase to KingHost and do not reapply already-applied migrations.

Applied Phase 3 migration:

- Git file: `supabase/migrations/202609020003_customer_accounts_orders.sql`
- Supabase history entry: `20260902220354_customer_accounts_orders`
- rollback-only validation matrix: **10/10 PASS**

Applied durable password-recovery migration:

- Git file: `supabase/migrations/202609050001_password_recovery_grants.sql`
- Supabase history entry: `20260906190757_password_recovery_grants`
- application: successful
- `password_recovery_grants`: RLS enabled; direct table DML revoked
- recovery grant RPCs: fixed empty `search_path`, service-role-only execution
- invalid-claim smoke: PASS
- fresh KingHost end-to-end password-recovery acceptance: **PASS**

Do **not** reapply either migration.

## Supabase advisor classification

Current advisor findings do not block Phase 3 completion:

- `RLS Enabled No Policy` on backend-only tables is intentional where direct table privileges are revoked and access is restricted to server/RPC boundaries;
- `customer_get_order` and `customer_list_orders` are intentionally authenticated-callable `SECURITY DEFINER` RPCs: both derive ownership from `auth.uid()`, return curated data, and passed database plus two-account browser isolation acceptance;
- leaked-password protection is currently disabled and remains a separate pre-launch Auth hardening option;
- `customer_profiles` policies have the advisor's `auth_rls_initplan` performance warning and can be optimized in a later performance-hardening pass;
- the reported unused admin audit index is informational and should not be removed solely from low pre-launch usage.

Do not weaken the accepted authorization model merely to silence an intentional advisor warning.

## Temporary legacy database compatibility

`orders.public_token` still exists and is populated because the current database column remains required. The old `claim_guest_order_for_customer` RPC also remains in the database schema.

These are **legacy schema only**:

- active application navigation does not use `public_token`;
- Mercado Pago return URLs do not use it;
- public `/pedido/[token]` application routing is absent;
- guest claim UI/API/service is absent.

Removal of `public_token` and the legacy guest-claim RPC belongs to a later explicit pre-launch clean-slate migration after the broader test-data wipe. Do not reintroduce application dependencies on them.

## KingHost runtime

- application: `proxybembem`
- Node.js: **22.1.0**
- source: `~/apps_nodejs/proxybembem`
- panel entrypoint: `proxybembem/app.js`
- port: KingHost-provided environment variable; never hard-code an allocated port
- canonical runbook: `docs/deployment/kinghost.md`

The runtime adapter loads the project-root `.env.production` before starting standalone Next.

The Phase 3 completion checkpoint is documentation-only; it does **not** require another KingHost redeploy.

## Branch state / integration gate

`feat/admin-dashboard-expansion` is based on `main`. At the Phase 3 completion boundary it is ahead of `main` and not behind it.

Do not merge, squash, rebase, delete or force-move this branch without the owner's explicit integration choice.

## Safety gates that remain

- Do not reapply Phase 1/2/3 migrations.
- Do not reapply `password_recovery_grants`.
- Keep checkout ownership derived only from verified Supabase Auth identity.
- Do not restore guest checkout/payment, `/pedido/[token]`, guest claim application surfaces or browser-selected customer ownership.
- Keep customer reads owner-scoped and other-owner UUIDs indistinguishable from missing orders.
- Keep provider production-environment safety enabled.
- Do not expose secrets, auth credentials, recovery tokens, payment credentials, order UUIDs or customer-private data in Git/chat/logs.
- Broader test-account/test-data deletion is a separate pre-launch operation and requires an explicit scoped cleanup decision.

## NEXT EXACT ACTION

1. Confirm this Phase 3 completion documentation commit is green in GitHub CI.
2. Choose branch integration handling for `feat/admin-dashboard-expansion` against `main`: merge, create a PR, or keep the branch as-is.
3. Only after that integration choice, begin the next approved project phase or a separately approved pre-launch clean-slate/hardening operation.
