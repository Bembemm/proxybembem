# ProxyBembem — Current Status

**Updated:** 2026-09-06

Canonical continuation checkpoint. Detailed intermediate evidence remains in Git history and in `docs/superpowers/plans/`; this file records the current verified state and exact resume action.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Primary branch: `feat/admin-dashboard-expansion`
- Phase 3 plan: `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
- Authenticated checkout/private orders design: `docs/superpowers/specs/2026-09-06-authenticated-checkout-private-orders-design.md`
- Authenticated checkout/private orders plan: `docs/superpowers/plans/2026-09-06-authenticated-checkout-private-orders.md`
- Durable password recovery design: `docs/superpowers/specs/2026-09-05-password-recovery-durable-grant-design.md`
- Durable password recovery plan: `docs/superpowers/plans/2026-09-05-password-recovery-durable-grant.md`
- State: **Phase 3 Tasks 1–13 remain complete/database-validated. Authenticated checkout/private-order application work is CI-green. Durable password-recovery migration is applied and database-validated. The production checkout 401 regression is now production-verified as resolved. Task 14 remains open only for the remaining browser-level private-order/public-route/password-recovery acceptance checks and synthetic fixture cleanup.**
- Phase 4: **do not start before Phase 3 completion.**

## Customer authentication acceptance already established

Real KingHost acceptance has already established the normal customer signup path through email confirmation and subsequent login. Do not restart that work unless a later regression requires it.

Customer authorization remains independent from admin authorization and must continue deriving identity from the verified Supabase Auth user.

## Authenticated checkout and private orders — implemented

The approved production model is implemented in the active application:

1. catalog, cart and freight remain public;
2. `POST /api/checkout` requires a verified authenticated customer before any order reservation or Mercado Pago preference creation;
3. the verified account email is authoritative for checkout;
4. every new checkout order is reserved with the authenticated `customer_id` and verified `customer_email`;
5. checkout-attempt reuse is restricted to the same authenticated customer;
6. Mercado Pago success/pending/failure back URLs target `/minha-conta/pedidos/{order-id}`;
7. an expired session preserves the exact private order path through `/entrar?next=...`;
8. another customer opening a copied order UUID receives the same not-found behavior as a missing order;
9. anonymous cart product lines and the validated checkout draft are preserved through the login round-trip in same-tab `sessionStorage` for at most 30 minutes; the selected freight service ID may be restored only after a fresh quote, and the previous signed quote token is never reused;
10. successful password login persists the Supabase SSR session directly in response cookies and no longer transports access/refresh tokens through browser JSON;
11. `POST /api/checkout` participates in the Supabase session-refresh proxy matcher before its owner-auth check;
12. `/pedido/[token]`, guest claim UI/API/service, public order lookup, and the `account-claim` rate-limit scope are removed from the active application.

### Temporary legacy database compatibility

`orders.public_token` still exists and is still populated because the current database column is required. The old `claim_guest_order_for_customer` RPC also remains in the Phase 3 database schema.

These are **legacy schema only**. They are not used for active customer navigation or Mercado Pago return URLs, and the public order page and guest-claim API/UI are absent.

Do not reintroduce application dependencies on `public_token` or guest claim. Remove that legacy schema only in the later separate pre-launch clean-slate database hardening after test data is removed.

## Production checkout acceptance — 401 resolved

A previous Task 14 production pass reached `POST /api/checkout` after login and received `401 Unauthorized`. Root cause was a split session handoff: the login API used a non-persistent server client, returned Supabase tokens through JSON, and browser JavaScript later called `auth.setSession()`, while protected checkout trusted the SSR cookie session. The checkout endpoint was also outside the Supabase session-refresh proxy matcher.

That architecture was replaced with a single server-owned session handoff:

- `/api/account/login` signs in through `createSupabaseRouteClient(request)` and applies Supabase auth cookies directly to its `NextResponse`;
- login JSON contains no access or refresh tokens;
- browser login no longer calls `auth.setSession()`;
- successful login performs a full same-origin navigation only after the cookie-bearing response completes;
- `/api/checkout` is included in the Supabase proxy matcher so an eligible session can refresh before the checkout owner-auth check.

A later browser regression showed the cart drawer still covering `/entrar`. The checkout code correctly closed it before navigation, but the saved checkout draft was being restored by the globally-mounted `CartPanel` on every storefront route, reopening the drawer on the login page.

The restoration rule is now route-bound: the saved checkout draft may reopen the cart only on `/produtos`, which is the intended post-login continuation.

### TDD / CI evidence for the final cart-login fix

- RED commit `cbdd35dddbf7785009b54eff7a6c248221789609` — `test: keep saved checkout cart closed on login`
- RED CI run `34061725508`: **405/406 PASS**, with only the new route-aware draft restoration regression test failing
- GREEN commit `2945f495ba273055d64251bdd310df3947b629f6` — `fix: restore checkout cart only on products`
- GREEN CI run `34061829912`: **PASS**
- exact KingHost Node 22.1.0 setup/version check: PASS
- frozen install: PASS
- typecheck: PASS
- KingHost build: PASS
- private-order production route-manifest gate: PASS
- startup smoke: PASS
- tests: **406/406 PASS**

### Production evidence on 2026-09-06

The GREEN runtime was deployed to KingHost and the checkout path was repeated in production.

Verified evidence:

- the login page no longer has the cart drawer reopened over it;
- the checkout round-trip returned to the storefront continuation and reached payment start;
- a new production acceptance order was created at approximately 19:31 America/Sao_Paulo;
- the new order has a non-null `customer_id` and `customer_email`;
- the order has a Mercado Pago `preference_id` and `checkout_url`;
- its payment/fulfillment state remains `pending` / `awaiting_payment` because no real paid transaction is required for acceptance;
- the stored `customer_id` matches the Supabase Auth user that owns the order;
- the stored customer e-mail matches that confirmed Auth user's e-mail;
- the owner Auth user is e-mail-confirmed.

This production evidence closes the previously observed unauthenticated `401`: authenticated checkout now successfully creates the owned order and Mercado Pago preference and reaches the payment-start response.

## Live database owner-isolation check

A rollback-only production database check was run against the newest acceptance order using two different already-confirmed Auth user identities and the actual `public.customer_get_order(uuid)` RPC.

The RPC itself is `SECURITY DEFINER`, fixed empty `search_path`, executable by `authenticated`, and derives ownership from `auth.uid()` before selecting the order by both `id` and `customer_id`.

Correct claim simulation result:

- owner identity: order payload is non-null;
- different confirmed identity: order payload is null.

An initial diagnostic used `count(*)` against the scalar `jsonb` function and misleadingly returned one row for a null scalar result. No schema/code change was made from that diagnostic. The test was corrected to inspect nullness of the returned scalar directly, after which the expected owner isolation passed.

This validates the live database authorization boundary. Browser-level Account B pasted-UUID acceptance remains required by Task 14 before the phase is formally complete.

## Hosted Supabase checkpoint

Hosted project: `ProxyBembem` (`kicgoocozxzkuoqajqif`), currently healthy.

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
- direct table DML for `anon`: none
- direct table DML for `authenticated`: none
- direct table DML for `service_role`: none
- `issue_password_recovery_grant`, `claim_password_recovery_grant`, and `finish_password_recovery_grant`: `SECURITY DEFINER`, fixed empty `search_path`, executable only by `service_role`
- key-format, expiry-order, lease-pair, primary-key, foreign-key constraints: present
- `password_recovery_grants_user_id_idx`: present
- non-destructive invalid-claim smoke: returned `invalid` with null user and no grant mutation

Supabase security advisor reports `RLS Enabled No Policy` for this backend-only table. This is expected because direct table privileges are fully revoked and access is intentionally only through the service-role RPC boundary. The new password-recovery RPCs did not appear as authenticated-executable advisor findings.

Do **not** reapply this migration.

## Password recovery — code/database state

The application-owned durable recovery-grant implementation remains the intended recovery architecture. It uses a random application token, stores only its server-derived HMAC grant key, avoids consuming a Supabase one-time verification link on e-mail click, and performs the password update server-side only after a durable grant claim.

The implementation is CI-covered and its hosted migration is present. Its remaining acceptance is one fresh end-to-end recovery flow on the deployed KingHost application.

Do not use or retest old recovery links from superseded PKCE/TokenHash flows.

## KingHost runtime

- application: `proxybembem`
- Node.js: **22.1.0**
- source: `~/apps_nodejs/proxybembem`
- panel entrypoint: `proxybembem/app.js`
- port: KingHost-provided environment variable; never hard-code an allocated port
- canonical runbook: `docs/deployment/kinghost.md`

The runtime adapter loads the project-root `.env.production` before starting standalone Next.

## Phase 3 Task 14 — remaining acceptance only

The production checkout/login/payment-start regression path has now passed. Task 14 is still not formally complete because the following browser-level acceptance checks remain:

1. while logged in as Account A, open the newly-created order from `Minha Conta > Pedidos` and confirm its private detail page renders;
2. copy that private order URL, sign out, sign in as a different confirmed Account B, paste Account A's exact private order URL, and confirm 404/not-found with no order/customer data;
3. visit any legacy `/pedido/<token>`-shaped URL and confirm 404/not-found with no order/customer data;
4. run one **fresh** durable password-recovery request/link/reset on KingHost, then log in with the new password;
5. remove only synthetic acceptance fixtures after all checks are complete.

The live database owner-isolation check already proves Account B receives null from the underlying customer-order RPC. The browser route still needs the explicit production acceptance above because Task 14 requires end-to-end proof through the deployed application.

Task 14 may be marked complete only after those production checks pass.

## Safety gates

- Do not reapply Phase 1/2/3 migrations.
- Do not reapply `password_recovery_grants`; it is already in hosted migration history.
- Do not restart Phase 3 Tasks 1–13.
- Do not start Phase 4 before Task 14/Phase 3 completion.
- Keep checkout ownership derived from the verified authenticated Supabase user.
- Do not restore guest checkout, `/pedido/[token]`, guest claim UI/API, or browser-selected customer ownership.
- Keep customer reads owner-scoped and other-owner UUIDs indistinguishable from missing orders.
- Keep production provider environment safety enabled.
- Do not expose secrets, auth credentials, recovery tokens, payment credentials, order UUIDs, or customer-private data in Git/chat/logs.

## NEXT EXACT ACTION

1. Confirm this documentation checkpoint is green in GitHub CI; it is docs-only and does not require another KingHost runtime redeploy.
2. In production as Account A, open the newest acceptance order from `Minha Conta > Pedidos` and confirm the private detail page renders.
3. Copy its URL, switch to a different confirmed Account B, paste the URL, and confirm 404/not-found with no private data.
4. Visit a dummy legacy `/pedido/teste` URL and confirm 404/not-found.
5. Run one fresh password-recovery flow and confirm login with the new password.
6. After those checks pass, remove only the synthetic acceptance fixtures, update this checkpoint, and mark Phase 3 Task 14 complete. The later removal of `public_token`/guest-claim schema remains a separate pre-launch operation.
