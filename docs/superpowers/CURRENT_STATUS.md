# ProxyBembem — Current Status

**Updated:** 2026-09-04

Canonical continuation checkpoint. Detailed intermediate evidence stays in Git history and in `docs/superpowers/plans/`; this file records only the current state and exact resume action.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Branch: `feat/admin-dashboard-expansion`
- Phase 3 plan: `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
- State: **Phase 3 Tasks 1–13 complete/applied/database-validated; Task 14 owner-auth acceptance is still pending on KingHost.**
- Phase 4: **do not start before Phase 3 completion.**

## Database checkpoint — do not repeat

The current hosted Supabase `ProxyBembem` project remains the backend. Do not migrate it to KingHost and do not reapply Phase 1/2/3 migrations.

Phase 3 migration:

- Git file: `supabase/migrations/202609020003_customer_accounts_orders.sql`
- applied Supabase history entry: `20260902220354_customer_accounts_orders`
- application: successful
- rollback-only validation matrix: **10/10 PASS**
- cleanup after validation: zero synthetic orders/profiles/claim events/Auth users left behind
- real order count remained 25 at validation time
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

## KingHost is the selected runtime

Owner approved completing the Vercel -> KingHost migration.

Current KingHost contract:

- hosting: KingHost Node.js III
- application: `proxybembem`
- Node.js: **22.1.0**
- `.nvmrc`: `22.1.0`
- web path: `/`
- source: `~/apps_nodejs/proxybembem`
- panel entrypoint: `proxybembem/app.js`
- port: KingHost-provided environment variable; never hard-code an allocated port

### Confirmed public routing behavior

Production diagnosis proved:

- dynamic HTML/API requests are proxied to the Next standalone Node process;
- browser static files are served by KingHost Nginx from `~/www` before Node;
- the same CSS/JS/`public` files returned 200 directly from the active Node port but 404 publicly until copied into `~/www`;
- after publishing `public/` and `.next/static/` into the webroot, public CSS and JavaScript returned 200 with correct MIME types and the storefront rendered normally.

This behavior is automated by:

```text
scripts/kinghost/prepare-standalone.mjs
scripts/kinghost/publish-assets.mjs
```

Commands:

```text
pnpm build:kinghost   # CI-safe; never writes to ~/www
pnpm deploy:kinghost  # server deploy; build + webroot asset publication
```

Canonical operator runbook: `docs/deployment/kinghost.md`.

The publisher does not remove/recreate `~/www`; it preserves unrelated files and old immutable Next asset hashes during deployment transitions.

## Password recovery PKCE incident — 2026-09-04

The remaining Task 14 password-recovery acceptance exposed an intermittent PKCE state failure after the callback/page routing issues had already been fixed.

Observed production evidence:

- a known-good recovery at approximately `21:26Z` completed `/recover -> /verify -> /token -> /user` successfully;
- a later callback at `21:40:46Z` reached the Next.js callback with a verifier cookie present but failed `exchangeCodeForSession()` with `flow_state_not_found`;
- a subsequent callback at `21:41:37Z` reached the Next.js callback without a verifier cookie and failed with `pkce_code_verifier_not_found`;
- therefore the specific failures were not explained by `/redefinir-senha` being absent and were not cases where the KingHost public layer skipped the callback entirely;
- Supabase Auth logs also showed repeated/expired one-time verification attempts, so old recovery links must not be reused during acceptance.

Root cause addressed in the branch candidate:

- the installed `@supabase/supabase-js` supports isolated overlapping PKCE flows;
- `lib/supabase/route.ts` now enables `auth.experimental.appendPkceFlowIdToRedirects`;
- Supabase therefore carries `sb_flow_id` on the redirect and stores the verifier in a flow-scoped slot;
- `app/auth/callback/route.ts` reads `sb_flow_id` and calls `exchangeCodeForSession(code, { flowId })` for that exact flow;
- legacy/no-flow-id callbacks remain backward compatible by using the existing exchange behavior;
- `app/api/account/password-reset/route.ts` now logs only safe booleans proving whether a verifier cookie and a flow-scoped verifier cookie were queued; it does not log email, cookie values, tokens, password, verifier, or authorization code;
- the callback diagnostic remains bounded to `hasCodeVerifierCookie`, `exchangeSucceeded`, and sanitized `exchangeErrorCode`.

TDD evidence:

- RED commit: `0d8b570d67fe5d445343fdd42372ea76941e7843` — `test: reproduce overlapping recovery PKCE failure`;
- RED CI run `33933607432`, job `101217096462`: typecheck/build/KingHost smoke passed and exactly the 2 new PKCE/diagnostic tests failed (`387 PASS / 2 FAIL`);
- GREEN runtime commit: `e929311e738ebc8f824d5a842d0cf1ea51169354` — `fix: isolate overlapping password recovery PKCE flows`;
- test-only matcher correction: `14965d3acf6c29c04b6f63e139bae01d19b9813d` — `test: allow formatted PKCE flow id exchange`; the runtime code did not change in this commit.

## Latest verified runtime candidate

Exact runtime candidate descendant:

`14965d3acf6c29c04b6f63e139bae01d19b9813d`

GitHub Actions run `33933983628`, job `101218200901`:

- `pnpm install --frozen-lockfile`: PASS
- exact KingHost Node 22.1.0 verification: PASS
- `pnpm typecheck`: PASS
- `pnpm build:kinghost`: PASS
- KingHost startup-adapter smoke: PASS
- tests: **389/389 PASS**

This is the current code candidate for KingHost. Do not replace it with the older `c4e2fc...` checkpoint.

## Supabase redirect allow-list gate before the next recovery email

The multi-flow PKCE option appends a dynamic `sb_flow_id` query parameter to the configured recovery `redirectTo`. Supabase Auth requires the resulting redirect URL to match the hosted project's **Authentication -> URL Configuration -> Redirect URLs** allow-list.

The currently connected Supabase tooling does not expose that hosted Auth URL Configuration, so this must be checked in the dashboard before using another recovery email.

Expected production callback family:

```text
https://www.proxybembem.com.br/auth/callback?next=%2Fredefinir-senha&sb_flow_id=<dynamic>
```

If the existing production Redirect URL entry already covers arbitrary query parameters on the exact `/auth/callback` path, do not change it. If it is an exact URL that cannot match the appended parameter, use the narrow Supabase-supported callback pattern:

```text
https://www.proxybembem.com.br/auth/callback**
```

Do not broaden the allow-list to unrelated domains. Do not request another recovery email until this gate is confirmed and the candidate is deployed.

## Vercel retirement

Active Vercel runtime coupling has been retired from the application candidate:

- `vercel.json` removed;
- `VERCEL_ENV` removed from active runtime decisions;
- `x-vercel-*` forwarding dependency removed;
- HSTS/provider production safety derives from `NODE_ENV=production`;
- the old Vercel cron contract was replaced by KingHost `X-CRON-AUTH` support on the existing Melhor Envio refresh endpoint.

The unused `@vercel/analytics` package entry remains only as dependency/lockfile cleanup debt; the client integration itself is already absent and it emits no runtime requests. Do not weaken frozen-lockfile deployment merely to remove that inert entry.

Owner approval to remove the Vercel rollback target has been given. Actual external Vercel project deletion should happen only after the cleaned KingHost candidate is deployed and its public smoke is confirmed, so we do not delete the old service before the replacement candidate is live.

## Melhor Envio cron

The existing maintenance endpoint remains:

```text
GET /api/internal/melhor-envio/refresh
```

It accepts the same strong `CRON_SECRET` through either controlled manual Bearer auth or KingHost `X-CRON-AUTH`. Configure the KingHost Cronjob for daily 03:17 and use the panel-provided `X_CRON_AUTH` value as `CRON_SECRET` in production. Never put that value in Git/chat.

## Phase 3 Task 14 — remaining owner acceptance

Automated account/security coverage is green. After the current KingHost candidate is deployed and public smoke passes, complete these manual acceptance checks using normal Supabase verification; no credentials/codes are shared in chat:

1. password recovery using exactly one freshly requested link in the same browser context; expected request diagnostic has `verifierCookieSet: true` and `flowScopedVerifierCookieSet: true`, expected callback diagnostic has `hasCodeVerifierCookie: true`, `exchangeSucceeded: true`, `exchangeErrorCode: null`, and the browser lands on `/redefinir-senha`;
2. test customer login;
3. `/minha-conta`;
4. own orders list and own order detail;
5. profile and security page;
6. second account cannot read first account's order UUID;
7. deliberately created safe guest order can be claimed only with verified matching email + 64-character token;
8. review KingHost/application error logs after the checks.

No real Mercado Pago payment is required for the guest-claim test.

## Safety gates

- Do not reapply Supabase migrations.
- Do not restart Phase 3 Tasks 1–13.
- Do not start Phase 4 before Task 14/Phase 3 completion.
- Keep customer authorization `auth.uid()`-derived.
- Keep guest claim verified-identity + token only.
- Keep production provider environment safety enabled.
- Keep secrets outside Git.
- Do not reuse old password-recovery links during acceptance.
- Do not request a fresh recovery email before the redirect allow-list gate and KingHost deployment are complete.

## NEXT EXACT ACTION

1. In the hosted Supabase project, verify **Authentication -> URL Configuration -> Redirect URLs** accepts the production `/auth/callback` URL with the appended dynamic `sb_flow_id`. Keep the existing entry if it already covers it; otherwise use the narrow callback pattern documented above.
2. Deploy the latest branch candidate to KingHost with the canonical runbook:

```bash
cd ~/apps_nodejs/proxybembem
git pull --ff-only
nvm use
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production npx pnpm@10 deploy:kinghost
```

3. Restart the application through the KingHost panel, then run the public home/static/CSS/JS smoke from `docs/deployment/kinghost.md`.
4. Only after those gates, request one fresh recovery link, click it once in the same browser context, and compare the safe request/callback diagnostics above.
5. Continue the rest of Phase 3 Task 14 only after password recovery passes.
