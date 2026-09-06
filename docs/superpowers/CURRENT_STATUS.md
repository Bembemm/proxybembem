# ProxyBembem — Current Status

**Updated:** 2026-09-06

Canonical continuation checkpoint. Detailed intermediate evidence stays in Git history and in `docs/superpowers/plans/`; this file records the current verified state and exact resume action.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Primary branch: `feat/admin-dashboard-expansion`
- Phase 3 plan: `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
- Authenticated checkout/private orders design: `docs/superpowers/specs/2026-09-06-authenticated-checkout-private-orders-design.md`
- Authenticated checkout/private orders plan: `docs/superpowers/plans/2026-09-06-authenticated-checkout-private-orders.md`
- Durable password recovery design: `docs/superpowers/specs/2026-09-05-password-recovery-durable-grant-design.md`
- Durable password recovery plan: `docs/superpowers/plans/2026-09-05-password-recovery-durable-grant.md`
- State: **Phase 3 Tasks 1–13 remain complete/database-validated. Authenticated checkout/private-order application work is CI-green. Durable password-recovery migration is now applied and database-validated. Task 14 production owner-auth acceptance is still pending on KingHost.**
- Phase 4: **do not start before Phase 3 completion.**

## Customer authentication acceptance already established

Real KingHost acceptance has already established the normal customer signup path through email confirmation and subsequent login. Do not restart that work unless a later regression requires it.

Customer authorization remains independent from admin authorization and must continue deriving identity from the verified Supabase Auth user.

## Authenticated checkout and private orders — implemented

The approved production model is now implemented in the active application:

1. catalog, cart and freight remain public;
2. `POST /api/checkout` requires a verified authenticated customer before any order reservation or Mercado Pago preference creation;
3. the verified account email is authoritative for checkout;
4. every new checkout order is reserved with the authenticated `customer_id` and verified `customer_email`;
5. checkout-attempt reuse is restricted to the same authenticated customer;
6. Mercado Pago success/pending/failure back URLs target `/minha-conta/pedidos/{order-id}`;
7. an expired session preserves the exact private order path through `/entrar?next=...`;
8. another customer opening a copied order UUID receives the same not-found behavior as a missing order;
9. anonymous cart state is preserved through the login redirect;
10. `/pedido/[token]`, guest claim UI/API/service, public order lookup, and the `account-claim` rate-limit scope are removed from the active application.

### Temporary legacy database compatibility

`orders.public_token` still exists and is still populated because the current database column is required. The old `claim_guest_order_for_customer` RPC also remains in the Phase 3 database schema.

These are **legacy schema only**:

- they are not used for active customer navigation;
- they are not used in Mercado Pago return URLs;
- the public order page and guest-claim API/UI are absent;
- they remain pending the separate pre-launch clean-slate database hardening after test data is removed.

Do not reintroduce application dependencies on `public_token` or guest claim.

## Checkout/private-order verification evidence

### Task 5 removal fix

- commit `50256dc9e9a541044e81df8389c186299c8ac757` — `test: remove deleted public order status from policy scan`
- CI run `34052605374`: **PASS**
- exact KingHost Node 22.1.0 setup/version check: PASS
- frozen install: PASS
- typecheck: PASS
- KingHost build: PASS
- startup smoke: PASS
- tests: **402/402 PASS**

### Permanent production-route privacy gate

- commit `37f2252c1252230128655098a19f4ab81e63319e` — `ci: verify private order route contract`
- CI run `34052887704`, job `101539530601`: **PASS**
- exact Node 22.1.0: PASS
- frozen install: PASS
- typecheck: PASS
- KingHost build: PASS
- production route manifest contract: **`private-order-route-contract-ok`**
- startup smoke: PASS
- tests: **402/402 PASS**

The CI route gate now fails if any production route begins with `/pedido/` or if `/minha-conta/pedidos/[id]/page` disappears.

### Final pre-migration checkpoint

- commit `145393820e79c4dc266db4b8c2f8b25eac870afa` — `docs: record authenticated checkout acceptance state`
- CI run `34053046811`, job `101539956932`: **PASS**
- exact Node 22.1.0: PASS
- frozen install: PASS
- typecheck: PASS
- KingHost build: PASS
- production route manifest contract: **PASS**
- startup smoke: PASS
- tests: **402/402 PASS**

## Hosted Supabase checkpoint

Hosted project: `ProxyBembem` (`kicgoocozxzkuoqajqif`), currently `ACTIVE_HEALTHY`.

Do not migrate Supabase to KingHost and do not reapply already-applied migrations.

Already-applied Phase 3 migration:

- Git file: `supabase/migrations/202609020003_customer_accounts_orders.sql`
- Supabase history entry: `20260902220354_customer_accounts_orders`
- application: successful
- rollback-only validation matrix: **10/10 PASS**

### Durable password-recovery migration — applied and validated

The exact Git migration was applied once to hosted Supabase on 2026-09-06:

- Git file: `supabase/migrations/202609050001_password_recovery_grants.sql`
- Supabase history entry: `20260906190757_password_recovery_grants`
- application: **successful**
- table `public.password_recovery_grants`: present with RLS enabled
- direct table DML for `anon`: **none**
- direct table DML for `authenticated`: **none**
- direct table DML for `service_role`: **none**
- `issue_password_recovery_grant`, `claim_password_recovery_grant`, and `finish_password_recovery_grant`: `SECURITY DEFINER`, fixed empty `search_path`, executable only by `service_role`
- key-format, expiry-order, lease-pair, primary-key, foreign-key constraints: present
- `password_recovery_grants_user_id_idx`: present
- non-destructive invalid-claim smoke: returned `invalid` with null user and no grant mutation

Supabase security advisor reports `RLS Enabled No Policy` for this backend-only table. This is expected here because direct table privileges are fully revoked and access is intentionally only through the service-role RPC boundary. The new password-recovery RPCs did not appear as authenticated-executable advisor findings.

Do **not** reapply this migration.

## Password recovery — code/database state

The application-owned durable recovery-grant implementation remains the intended recovery architecture. It uses a random application token, stores only its server-derived HMAC grant key, avoids consuming a Supabase one-time verification link on email click, and performs the password update server-side only after a durable grant claim.

The implementation is CI-covered and its required hosted migration is now present. Its remaining acceptance is a fresh end-to-end recovery flow on the deployed KingHost application.

Do not use or retest old recovery links from superseded PKCE/TokenHash flows.

## KingHost runtime

- application: `proxybembem`
- Node.js: **22.1.0**
- source: `~/apps_nodejs/proxybembem`
- panel entrypoint: `proxybembem/app.js`
- port: KingHost-provided environment variable; never hard-code an allocated port
- canonical runbook: `docs/deployment/kinghost.md`

The runtime adapter loads the project-root `.env.production` before starting standalone Next.

## Phase 3 Task 14 — still not complete

CI and hosted migration validation are not enough to mark Task 14 complete. After the final verified branch HEAD is deployed to KingHost, production acceptance must still prove all of the following without making a real paid Mercado Pago transaction solely for testing:

1. anonymous shopper can build cart/address/freight but payment redirects to `/entrar?next=%2Fprodutos` and creates no order/preference;
2. after login, cart product lines remain available;
3. authenticated checkout creates an order with the logged-in account UUID/email and returns toward `/minha-conta/pedidos/{uuid}`;
4. Account A can open its private order UUID;
5. Account B pasting Account A's exact UUID receives 404/not found with no order data;
6. an old `/pedido/<token>` URL returns 404/not found and exposes no order/customer data;
7. a fresh durable password-recovery request/link/reset succeeds on KingHost;
8. only synthetic acceptance fixtures are removed afterward.

Task 14 may be marked complete only after those production checks pass.

## Safety gates

- Do not reapply Phase 1/2/3 migrations.
- Do not reapply `password_recovery_grants`; it is now in hosted migration history.
- Do not restart Phase 3 Tasks 1–13.
- Do not start Phase 4 before Task 14/Phase 3 completion.
- Keep checkout ownership derived from the verified authenticated Supabase user.
- Do not restore guest checkout, `/pedido/[token]`, guest claim UI/API, or browser-selected customer ownership.
- Keep customer reads owner-scoped and other-owner UUIDs indistinguishable from missing orders.
- Keep production provider environment safety enabled.
- Do not expose secrets, auth credentials, recovery tokens, payment credentials, or customer-private data in Git/chat/logs.

## NEXT EXACT ACTION

1. Confirm this `CURRENT_STATUS.md` commit is green in GitHub CI.
2. Deploy the final verified `feat/admin-dashboard-expansion` HEAD to KingHost with the normal runbook and restart through the KingHost process authority/panel.
3. Run the authenticated-checkout/private-order Task 14 production acceptance above plus one fresh durable password-recovery acceptance.
4. Only after production evidence passes, mark Task 14 complete. The later all-test-data wipe and removal of `public_token`/guest-claim schema remain a separate pre-launch operation.
