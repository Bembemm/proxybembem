# ProxyBembem — Current Status

**Updated:** 2026-09-03

Canonical continuation checkpoint. Detailed intermediate evidence stays in Git history and in `docs/superpowers/plans/`; this file records only the current state and exact resume action.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Branch: `feat/admin-dashboard-expansion`
- Phase 3 plan: `docs/superpowers/plans/2026-09-02-customer-account-orders.md`
- State: **Phase 3 Tasks 1–13 complete/applied/database-validated; Task 14 owner-auth acceptance pending on KingHost.**
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
- the same CSS/JS/`public` files returned 200 directly from port 21170 but 404 publicly until copied into `~/www`;
- after publishing `public/` and `.next/static/` into the webroot, public CSS and JavaScript returned 200 with correct MIME types and the storefront rendered normally.

This behavior is now automated by:

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

## Vercel retirement

Active Vercel runtime coupling has been retired from the application candidate:

- `vercel.json` removed;
- `VERCEL_ENV` removed from active runtime decisions;
- `x-vercel-*` forwarding dependency removed;
- HSTS/provider production safety derives from `NODE_ENV=production`;
- the old Vercel cron contract was replaced by KingHost `X-CRON-AUTH` support on the existing Melhor Envio refresh endpoint.

The unused `@vercel/analytics` package entry remains only as dependency/lockfile cleanup debt; the client integration itself is already absent and it emits no runtime requests. Do not weaken frozen-lockfile deployment merely to remove that inert entry.

Owner approval to remove the Vercel rollback target has been given. Actual external Vercel project deletion should happen only after the cleaned KingHost candidate below is deployed and its public smoke is confirmed, so we do not delete the old service before the replacement candidate is live.

## Latest verified cleanup candidate

KingHost-only runtime candidate:

`c4e2fc83804711310f29334a27658109db23cbb5`

GitHub Actions run `33813327803`, job `100839913935`:

- `pnpm install --frozen-lockfile`: PASS
- tests: **370/370 PASS**
- typecheck: PASS
- exact KingHost Node 22.1.0 setup: PASS
- `pnpm build:kinghost`: PASS
- KingHost startup-adapter smoke: PASS

This candidate includes the safe KingHost asset publisher, consolidated deployment scripts, Vercel runtime retirement and KingHost cron authentication support.

## Melhor Envio cron

The existing maintenance endpoint remains:

```text
GET /api/internal/melhor-envio/refresh
```

It accepts the same strong `CRON_SECRET` through either controlled manual Bearer auth or KingHost `X-CRON-AUTH`. Configure the KingHost Cronjob for daily 03:17 and use the panel-provided `X_CRON_AUTH` value as `CRON_SECRET` in production. Never put that value in Git/chat.

## Phase 3 Task 14 — remaining owner acceptance

Automated account/security coverage is already green. After the cleaned KingHost candidate is deployed and public smoke passes, complete only these manual acceptance checks using normal Supabase verification; no credentials/codes are shared in chat:

1. test customer login;
2. `/minha-conta`;
3. own orders list and own order detail;
4. profile and security page;
5. second account cannot read first account's order UUID;
6. deliberately created safe guest order can be claimed only with verified matching email + 64-character token;
7. review KingHost/application error logs after the checks.

No real Mercado Pago payment is required for the guest-claim test.

## Safety gates

- Do not reapply Supabase migrations.
- Do not restart Phase 3 Tasks 1–13.
- Do not start Phase 4 before Task 14/Phase 3 completion.
- Keep customer authorization `auth.uid()`-derived.
- Keep guest claim verified-identity + token only.
- Keep production provider environment safety enabled.
- Keep secrets outside Git.

## NEXT EXACT ACTION

Deploy the latest branch candidate to KingHost with the canonical runbook:

```bash
cd ~/apps_nodejs/proxybembem
git pull --ff-only
nvm use
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production npx pnpm@10 deploy:kinghost
```

Then restart the application through the KingHost panel and verify public `/`, one `public/` image, CSS and JavaScript. After that, configure/verify the KingHost Melhor Envio cron, retire the external Vercel project, and continue directly with Phase 3 Task 14 owner-auth acceptance.
