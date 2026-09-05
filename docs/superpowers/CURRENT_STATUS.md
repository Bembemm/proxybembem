# ProxyBembem — Current Status

**Updated:** 2026-09-05

Canonical continuation checkpoint. Detailed intermediate evidence stays in Git history and in `docs/superpowers/plans/`; this file records the current state and exact resume action.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Primary branch: `feat/admin-dashboard-expansion`
- Phase 3 plan: `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
- Password recovery design: `docs/superpowers/specs/2026-09-05-password-recovery-token-hash-design.md`
- Password recovery implementation plan: `docs/superpowers/plans/2026-09-05-password-recovery-token-hash.md`
- State: **Phase 3 Tasks 1–13 complete/applied/database-validated; Task 14 owner-auth acceptance remains pending on KingHost.**
- Phase 4: **do not start before Phase 3 completion.**

## Database checkpoint — do not repeat

The hosted Supabase `ProxyBembem` project remains the backend. Do not migrate it to KingHost and do not reapply Phase 1/2/3 migrations.

Phase 3 migration:

- Git file: `supabase/migrations/202609020003_customer_accounts_orders.sql`
- applied Supabase history entry: `20260902220354_customer_accounts_orders`
- application: successful
- rollback-only validation matrix: **10/10 PASS**
- cleanup after validation: zero synthetic orders/profiles/claim events/Auth users left behind
- no historical customer ownership/email was fabricated

Phase 3 security invariants remain locked:

1. email is mandatory on every new checkout;
2. guest checkout remains supported;
3. authenticated order ownership comes only from trusted Supabase Auth identity;
4. customer reads derive ownership from `auth.uid()` and never accept a browser-selected customer UUID;
5. guest claim requires verified matching account email plus the existing 64-character public token;
6. customer DTOs exclude payment/provider/admin/internal checkout fields;
7. Mercado Pago remains financial authority;
8. admin authorization remains independent from ordinary customer sessions.

## KingHost runtime

KingHost Node.js III is the selected application runtime.

- application: `proxybembem`
- Node.js: **22.1.0**
- source: `~/apps_nodejs/proxybembem`
- panel entrypoint: `proxybembem/app.js`
- port: KingHost-provided environment variable; never hard-code an allocated port
- canonical runbook: `docs/deployment/kinghost.md`

Public routing already established:

- dynamic HTML/API -> Next standalone Node process;
- static `public/` and `.next/static/` -> KingHost Nginx webroot `~/www`;
- `pnpm deploy:kinghost` builds and publishes the required browser assets without deleting unrelated/older immutable files.

## Password recovery — architecture replaced on 2026-09-05

The browser-bound recovery PKCE architecture has been replaced because production evidence showed recovery could fail when the email link opened outside the browser context that requested it.

Previous evidence included:

- one successful callback with a verifier;
- `flow_state_not_found` while a verifier cookie existed;
- `pkce_code_verifier_not_found` when the callback opened without the verifier;
- callback execution in Next.js was confirmed, so this was not simply a missing KingHost route.

The recovery flow no longer depends on `/auth/callback` or on the requesting browser's PKCE verifier.

### New recovery flow

The required Supabase **Reset Password** template is:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">
  Redefinir senha
</a>
```

Runtime behavior:

1. `POST /api/account/password-reset` calls `resetPasswordForEmail(input.email)` without a recovery callback redirect.
2. The email lands on `GET /auth/confirm?token_hash=...&type=recovery`.
3. `GET /auth/confirm` validates only the type/token shape, stores the token hash in a short-lived HttpOnly cookie, and redirects to clean `/redefinir-senha`.
4. **GET never calls `verifyOtp()`**, so an email scanner/link preview does not consume the one-time recovery token.
5. The token is verified only when the user submits the new password to `POST /api/account/password-recovery`.
6. The server calls `verifyOtp({ token_hash, type: "recovery" })`, applies the resulting Supabase session cookies, clears the raw recovery-token cookie, and calls `updateUser({ password })`.
7. On success, `signOut({ scope: "global" })` revokes sessions and the browser is sent back to login by the existing form flow.
8. If `verifyOtp()` succeeds but `updateUser()` fails, the raw token remains cleared but the Supabase recovery session is preserved so the user can retry without another email.
9. Retry is accepted only with a **recent Supabase-signed recovery AMR claim plus server `getUser()` validation**. No forgeable application `recovery=true` marker is trusted.

Security properties:

- no recovery token/hash, email, password, auth code, access token, refresh token, or cookie value is logged;
- recovery token cookie: host-only, HttpOnly, SameSite=Lax, Path=/, Secure in production, max-age 3600s;
- Supabase's own recovery-token validity still applies;
- recovery routes use `private, no-store` where the application controls the response;
- recovery has no caller-controlled redirect destination;
- `/auth/callback` remains for non-recovery PKCE flows;
- temporary recovery PKCE diagnostics were removed.

## TDD and verification evidence

Recovery RED baseline:

- `5da5adadc7c48986cd2b152c1b624d449d2a56bb` — `test: require token-hash password recovery`
- CI run `33976137232`, job `101333043819`: old runtime failed the new recovery expectations while typecheck/build/KingHost smoke remained green.

Signed-AMR security refinement test:

- `6c8f8d53b7399d591299d6fa91ee6f05daf6afb9` — `test: require signed recovery retry context`

Verified runtime candidate:

`6b991a1ee3cd9d88b478ff993f96235986887e94`

GitHub Actions run `33976620408`, job `101334337857` verified that exact runtime descendant:

- exact KingHost Node 22.1.0: PASS
- `pnpm install --frozen-lockfile`: PASS
- `pnpm typecheck`: PASS
- `pnpm build:kinghost`: PASS
- KingHost startup-adapter smoke: PASS
- tests: **391/391 PASS, 0 FAIL**
- production build includes dynamic `/auth/confirm` and `/redefinir-senha` routes.

Documentation was then aligned with the signed-AMR implementation in descendant commit `a05dbd0ea8dd93d92ce2da673b2e50600068e5ae`.

## Hosted Supabase configuration still required

The runtime code alone is not enough. Before requesting another real recovery email, update:

**Supabase Dashboard -> Authentication -> Email Templates -> Reset Password**

Use the token-hash link:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">
  Redefinir senha
</a>
```

The previously added callback wildcard can remain for the non-recovery callback flows, but recovery itself no longer depends on the callback or `sb_flow_id`.

The built-in Supabase SMTP recently returned `429 email rate limit exceeded` during repeated testing. That is separate from the application's own rate limiter. If it is still active during acceptance, wait for the provider limit to reset or configure custom SMTP; do not spam repeated recovery requests.

## Phase 3 Task 14 — remaining owner acceptance

After the current candidate is on KingHost and the Reset Password email template is updated:

1. request **one fresh** password-recovery email;
2. open the link normally (mobile email/custom tab is now an intended supported scenario);
3. confirm it lands on `/redefinir-senha` without consuming the token on the initial GET;
4. submit a new password once and confirm login works with the new password;
5. test customer login;
6. test `/minha-conta`, own orders list/detail, profile and security page;
7. confirm a second account cannot read the first account's order UUID;
8. confirm a deliberately created safe guest order can be claimed only by verified matching email + the 64-character token;
9. review KingHost/application logs after acceptance.

No real Mercado Pago payment is required for Task 14.

## Vercel retirement and Melhor Envio

- Active runtime is KingHost-only; do not reintroduce Vercel runtime coupling.
- Do not delete an external rollback target until the replacement deployment has been smoke-tested, unless separately and explicitly requested.
- Melhor Envio maintenance endpoint remains `GET /api/internal/melhor-envio/refresh` using the existing strong `CRON_SECRET` / KingHost `X-CRON-AUTH` contract.
- Keep secrets outside Git/chat.

## Safety gates

- Do not reapply Supabase migrations.
- Do not restart Phase 3 Tasks 1–13.
- Do not start Phase 4 before Task 14/Phase 3 completion.
- Keep customer authorization `auth.uid()`-derived.
- Keep guest claim verified-identity + token only.
- Keep production provider environment safety enabled.
- Do not expose secrets in Git/chat/logs.
- Do not request repeated recovery emails while Supabase's SMTP rate limit is active.

## NEXT EXACT ACTION

1. Fast-forward the verified recovery implementation/documentation into `feat/admin-dashboard-expansion` after final CI is green.
2. In Supabase Dashboard, change **Authentication -> Email Templates -> Reset Password** to the `TokenHash` `/auth/confirm` template above.
3. Deploy the branch to KingHost:

```bash
cd ~/apps_nodejs/proxybembem
git pull --ff-only
nvm use
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production npx pnpm@10 deploy:kinghost
```

4. Restart the application through the KingHost panel.
5. Run the public home/static/CSS/JS smoke from `docs/deployment/kinghost.md` and confirm auth responses are not publicly cached.
6. Only after those gates, request one fresh recovery email and complete the recovery acceptance above.
