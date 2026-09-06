# ProxyBembem — Current Status

**Updated:** 2026-09-05

Canonical continuation checkpoint. Detailed intermediate evidence stays in Git history and in `docs/superpowers/plans/`; this file records the current state and exact resume action.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Primary branch: `feat/admin-dashboard-expansion`
- Phase 3 plan: `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
- Durable password recovery design: `docs/superpowers/specs/2026-09-05-password-recovery-durable-grant-design.md`
- Durable password recovery plan: `docs/superpowers/plans/2026-09-05-password-recovery-durable-grant.md`
- State: **Phase 3 Tasks 1–13 complete/applied/database-validated; Task 14 owner-auth acceptance remains pending on KingHost.**
- Phase 4: **do not start before Phase 3 completion.**

## Database checkpoint — Phase 3 stays applied; one new recovery migration is pending

The hosted Supabase `ProxyBembem` project remains the backend. Do not migrate it to KingHost and do not reapply Phase 1/2/3 migrations.

Already-applied Phase 3 migration:

- Git file: `supabase/migrations/202609020003_customer_accounts_orders.sql`
- applied Supabase history entry: `20260902220354_customer_accounts_orders`
- application: successful
- rollback-only validation matrix: **10/10 PASS**
- cleanup after validation: zero synthetic orders/profiles/claim events/Auth users left behind

New recovery migration:

- Git file: `supabase/migrations/202609050001_password_recovery_grants.sql`
- status: **NOT APPLIED to hosted Supabase yet**
- reason: Supabase connector became unavailable during this implementation; apply this exact migration once through Supabase SQL Editor before deploying the durable-grant code
- do not reapply any older migration while doing this

## KingHost runtime

KingHost Node.js III is the selected application runtime.

- application: `proxybembem`
- Node.js: **22.1.0**
- source: `~/apps_nodejs/proxybembem`
- panel entrypoint: `proxybembem/app.js`
- port: KingHost-provided environment variable; never hard-code an allocated port
- canonical runbook: `docs/deployment/kinghost.md`

The runtime adapter now loads the project-root `.env.production` before starting standalone Next, so root production env is authoritative and does not depend on a stale `.next/standalone/.env.production` copy.

## Password recovery — durable scanner-safe architecture

Production acceptance exposed three concrete defects in earlier recovery designs:

1. browser-bound PKCE could fail when the recovery link opened outside the requesting browser context;
2. sending a Supabase `/auth/v1/verify` URL allowed mail scanners/prefetchers to consume the one-time provider link before the application received it;
3. the later TokenHash final-submit flow called `verifyOtp()` before changing the password. In real KingHost acceptance, the first password submit returned a transient `502`; a subsequent submit returned `401`, and login with the intended new password failed. The first request had consumed the one-time recovery token before password storage was guaranteed.

The TokenHash final-submit architecture is therefore superseded by an application-owned durable recovery grant.

### Current durable recovery flow

1. `POST /api/account/password-reset` remains same-origin, body-bounded and rate-limited.
2. The server calls `auth.admin.generateLink({ type: "recovery", email })` only to resolve the server-authenticated target account/user id; Supabase's generated `/verify` URL and `hashed_token` are not sent to the browser.
3. The application creates a fresh **256-bit random Base64URL token**.
4. The database stores only `HMAC-SHA256(token)` using the existing server-only `RATE_LIMIT_SECRET` with explicit domain separation; the raw bearer token is never stored in Postgres.
5. Issuing a new grant revokes older outstanding grants for the same user.
6. Resend sends only the application URL `/auth/confirm?token_hash=<app-token>&type=recovery`.
7. `GET /auth/confirm` validates the application-token shape, writes it to the existing host-only HttpOnly recovery cookie, sets `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`, then redirects to clean `/redefinir-senha`. It does not consume the grant.
8. Final `POST /api/account/password-recovery` requires same-origin, rate limit, bounded password input and the recovery cookie.
9. The server atomically claims the grant through a service-role-only RPC. The claim uses a **45-second lease** and shortens the remaining grant lifetime to at most **300 seconds** after first use.
10. Only after a successful claim does the server call `auth.admin.updateUserById(user_id, { password })` with the server-only Supabase secret client.
11. A provider/system failure releases the lease so the same valid link can be retried. A concurrent in-flight attempt returns retryable `409` without clearing the recovery cookie.
12. Successful password storage marks the grant consumed and clears the recovery cookie.

### Recovery-grant database security

`public.password_recovery_grants` stores only:

- 64-character HMAC grant key;
- `user_id`;
- create/expire timestamps;
- lease id/expiry;
- consumed/revoked timestamps.

It stores no raw recovery token, email, password, access token or refresh token.

Security controls in `202609050001_password_recovery_grants.sql`:

- RLS enabled;
- direct table access revoked from `public`, `anon`, `authenticated` and `service_role`;
- `issue_password_recovery_grant`, `claim_password_recovery_grant` and `finish_password_recovery_grant` are `SECURITY DEFINER` with empty `search_path`;
- RPC execute is explicitly granted only to `service_role`;
- max initial grant TTL is 3600 seconds;
- claim lease is bounded and concurrent claims fail as `busy`;
- successful completion is one-way (`consumed_at`).

The unavoidable cross-system edge after Auth password storage but before Postgres finalization is bounded: the claim remains leased temporarily, the post-claim grant lifetime is at most five minutes, and successful finalization clears the browser token. If finalization fails after password storage, the app explicitly tells the user that the password was changed and to log in with it.

## Recovery UI behavior

The password form now distinguishes retryable failures instead of collapsing every non-JSON/gateway response into one generic message:

- `409`: wait a few seconds and retry the same link;
- `429`: wait a few minutes and retry the same link;
- `5xx` or network/gateway failure: wait briefly and retry the same link;
- invalid/expired/consumed grant: `401` and the cookie is cleared.

## TDD and verification evidence

Durable-grant RED:

- commit `21665c2e9dbef248efbd948f998293fe24c3f2af` — `test: reproduce non-retryable password recovery submit`
- CI run `34002326553`, job `101403284775`: failed because the durable recovery helper/behavior did not yet exist, confirming the intended RED baseline.

Durable-grant green before the final referrer hardening:

- commit `317f9a8f24d92a1b04adc976c780223569a83eee`
- CI run `34002610124`, job `101404061176`
- exact Node 22.1.0: PASS
- frozen install: PASS
- typecheck: PASS
- KingHost build: PASS
- startup smoke: PASS
- tests: **398/398 PASS**

Referrer hardening RED:

- commit `a878b65dceaf48c7bf45eed051634e6d1bcd0c9c`
- CI run `34002740927`, job `101404410233`: typecheck/build/smoke passed; exactly the new recovery referrer test failed because `/auth/confirm` did not yet set `Referrer-Policy: no-referrer`.

Referrer hardening green:

- commit `b450e3ef97e4d7fb2dd461c4a4810ea27027a5f8`
- CI run `34002852049`, job `101404706419`
- exact Node 22.1.0: PASS
- frozen install: PASS
- typecheck: PASS
- KingHost build: PASS
- startup smoke: PASS
- full tests: PASS

The code is verified in CI, but production acceptance is **not complete** until the new migration is applied, this branch is deployed, and a fresh recovery flow succeeds on KingHost.

## Resend / email configuration

Already configured and independently verified on KingHost:

- domain `proxybembem.com.br` verified in Resend;
- sender `ProxyBembem <noreply@proxybembem.com.br>`;
- `RESEND_API_KEY` present in root `.env.production` and direct Node `fetch` to Resend returned HTTP 200;
- Supabase custom SMTP with Resend may remain enabled for ordinary Supabase Auth mail.

Keep provider keys outside Git/chat/logs.

## Phase 3 Task 14 — remaining owner acceptance

Task 14 is **not complete from CI alone**. After applying the one new recovery migration and deploying the durable-grant code:

1. ensure recovery rate-limit buckets are not already saturated from prior debugging;
2. request exactly one **new** password-recovery email after deployment; old recovery links from the superseded architecture are incompatible;
3. open only the newest application-domain `/auth/confirm` link;
4. confirm the browser lands on clean `/redefinir-senha`;
5. submit a new password once;
6. confirm `200`/redirect to login and successful login with the new password;
7. if a transient gateway failure occurs before completion, wait briefly and retry the **same** new link rather than requesting another email;
8. verify the used link/grant cannot be reused after success;
9. continue the remaining `/minha-conta`, own-order isolation and guest-claim Task 14 acceptance checks.

No real Mercado Pago payment is required for Task 14.

## Safety gates

- Do not reapply Phase 1/2/3 migrations.
- Apply only `202609050001_password_recovery_grants.sql` once before deploying this code.
- Do not restart Phase 3 Tasks 1–13.
- Do not start Phase 4 before Task 14/Phase 3 completion.
- Keep customer authorization `auth.uid()`-derived.
- Keep guest claim verified-identity + token only.
- Keep production provider environment safety enabled.
- Do not expose secrets or recovery credential values in Git/chat/logs.

## NEXT EXACT ACTION

1. Apply exactly `supabase/migrations/202609050001_password_recovery_grants.sql` once to hosted Supabase and validate its RLS/privileges/RPCs.
2. Only after the migration is confirmed, deploy `feat/admin-dashboard-expansion` to KingHost:

```bash
cd ~/apps_nodejs/proxybembem
git pull --ff-only
nvm use
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production npx pnpm@10 deploy:kinghost
git rev-parse HEAD
```

3. Restart through the KingHost panel/process authority.
4. Request one fresh recovery email and complete the durable recovery acceptance above.
