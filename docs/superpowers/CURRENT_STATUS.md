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

## Password recovery — final scanner-safe architecture

Production testing showed two separate failure modes in earlier attempts:

1. browser-bound PKCE could fail when the recovery link opened outside the browser context that requested it (`flow_state_not_found` / `pkce_code_verifier_not_found`);
2. even the later implicit-flow workaround still sent a Supabase `/auth/v1/verify` link. A real fresh email reached `/redefinir-senha#error=access_denied&error_code=otp_expired`, proving the one-time Supabase verification link could already be consumed/invalid before the application received a recovery session. Email security scanners/prefetchers are compatible with this symptom.

The recovery email therefore no longer contains a consumable Supabase `/verify` URL.

### Current recovery flow

1. `POST /api/account/password-reset` remains same-origin, bounded and rate-limited.
2. The server creates a Supabase recovery link with `auth.admin.generateLink({ type: "recovery", email })` but does **not** send Supabase's generated `/verify` link.
3. The server reads only the generated `properties.hashed_token`, validates its shape, and constructs the application-owned URL:

   `https://www.proxybembem.com.br/auth/confirm?token_hash=...&type=recovery`

4. The application sends that URL directly through the Resend API from `ProxyBembem <noreply@proxybembem.com.br>`.
5. `GET /auth/confirm` validates only recovery type/token shape, stores the token hash in a short-lived host-only HttpOnly cookie, and redirects to clean `/redefinir-senha`.
6. **GET /auth/confirm never calls `verifyOtp()`**, so a mail scanner, preview or ordinary first click does not consume the recovery token.
7. `/redefinir-senha` is public and displays the password form without requiring a pre-existing recovery session.
8. Only when the human submits the new password does `POST /api/account/password-recovery` call `verifyOtp({ token_hash, type: "recovery" })`.
9. The server applies the resulting Supabase session, calls `updateUser({ password })`, clears the raw recovery token cookie, and on success calls `signOut({ scope: "global" })`.
10. If token verification succeeds but password update fails, retry is accepted only using recent Supabase-signed recovery AMR plus `getUser()` validation.

Security properties:

- opening/clicking the email does not consume the recovery token;
- the token is still subject to Supabase's normal maximum validity and the app cookie max-age of 3600s;
- after a successful password change the recovery token is no longer usable;
- no recovery token/hash, email, password, Resend key, auth code, access token, refresh token or cookie value is logged;
- recovery token cookie is host-only, HttpOnly, SameSite=Lax, Path=/ and Secure in production;
- recovery responses controlled by the app use `private, no-store`;
- recovery has no caller-controlled redirect destination;
- `/auth/callback` remains only for non-recovery PKCE flows.

## Resend / email configuration

The user configured email delivery on 2026-09-05:

- Resend account created;
- domain `proxybembem.com.br` verified successfully with DNS on KingHost;
- DKIM/SPF/DMARC records added;
- Supabase custom SMTP configured with Resend for ordinary Supabase Auth mail.

The new scanner-safe recovery route additionally sends recovery mail **directly through the Resend API**, so KingHost now requires one new server-only environment variable:

```text
RESEND_API_KEY=
```

Keep this value outside Git/chat/logs. Prefer a Resend key restricted to sending access/domain when the Resend UI allows it.

Supabase custom SMTP may remain enabled for signup/other Auth emails; it is independent from the application-owned recovery delivery above.

## TDD and verification evidence

Original TokenHash recovery RED/green history remains in Git. The latest scanner-consumption regression was reproduced and fixed separately.

Scanner-safe RED:

- `3dcfe6af6346dcf2dce5118ad903b6127cf63efc` — `test: reproduce scanner-consumed recovery links`
- `449346bfd99b5e8fc470ae2e71677c127f1e8561` — `test: require server-side recovery password submit`
- CI run `33994910471`, job `101383640962`: typecheck/build/KingHost smoke passed while exactly the new recovery expectations failed, confirming the RED baseline.

Final scanner-safe runtime/documentation candidate:

`e8ff9c5f448039d4bd5ac9f30541294f52f111be`

GitHub Actions run `33995186311`, job `101384381207` verified this exact candidate:

- exact KingHost Node 22.1.0: PASS
- `pnpm install --frozen-lockfile`: PASS
- `pnpm typecheck`: PASS
- `pnpm build:kinghost`: PASS
- KingHost startup-adapter smoke: PASS
- tests: **392/392 PASS, 0 FAIL**
- production build includes dynamic `/auth/confirm`, `/redefinir-senha`, `/api/account/password-reset`, and `/api/account/password-recovery` routes.

## Phase 3 Task 14 — remaining owner acceptance

Task 14 is **not complete from CI alone**. After the scanner-safe candidate is deployed to KingHost with `RESEND_API_KEY` configured:

1. request exactly **one fresh** password-recovery email;
2. confirm the new message is visible in Resend Logs and its link starts with the application domain `/auth/confirm` rather than `*.supabase.co/auth/v1/verify`;
3. open the link normally and confirm the browser lands on clean `/redefinir-senha` without an `#error=...` fragment;
4. submit a new password once;
5. confirm redirect to login and successful login with the new password;
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
- Do not repeatedly request recovery emails during acceptance; use one fresh message per test attempt.

## NEXT EXACT ACTION

1. Fast-forward the verified scanner-safe recovery candidate into `feat/admin-dashboard-expansion` after final CI remains green.
2. In Resend create/retrieve a server-only sending API key and add it to the KingHost application environment as `RESEND_API_KEY`. Do not send the key in chat.
3. Deploy the branch to KingHost:

```bash
cd ~/apps_nodejs/proxybembem
git pull --ff-only
nvm use
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production npx pnpm@10 deploy:kinghost
git rev-parse HEAD
```

4. Restart the application through the KingHost panel.
5. Run the public home/static/CSS/JS smoke from `docs/deployment/kinghost.md` and confirm auth responses are not publicly cached.
6. Only after those gates, request one fresh recovery email and complete the recovery acceptance above.
