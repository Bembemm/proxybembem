# ProxyBembem Checkout — Current Status

**Updated:** 2026-08-31

This is the canonical continuation checkpoint. Read this file before using old plan checkboxes.

## Repository

- Repo: `Bembemm/proxybembem`
- Branch: `feat/checkout-mercadopago`
- PR: `#2` — open, draft, not merged
- Never merge `main` without explicit owner approval.
- Current rollout phase: **Preview/Sandbox accepted, including Admin Auth/MFA; Production provider guard implemented; Melhor Envio Production app created; Production environment values entered manually in Vercel; Production runtime not yet validated**.
- `main` remains untouched by the Preview acceptance work.
- Temporary Preview diagnostic routes from earlier checkout acceptance must remain absent.

## Admin Auth foundation — COMPLETE IN PREVIEW

The `/admin` area now uses Supabase Auth with a single owner account and mandatory Authenticator TOTP.

### Security model now implemented

- exactly one manually provisioned admin account;
- public signup disabled;
- immutable owner authorization by Supabase user UUID through server-only `ADMIN_USER_ID`;
- password first factor;
- mandatory TOTP Authenticator second factor / AAL2;
- no SMS fallback;
- no remembered/trusted-device bypass;
- no public signup/reset flow in the admin UI;
- browser receives only Supabase URL + publishable key;
- `SUPABASE_SECRET_KEY` and `ADMIN_USER_ID` stay server-only;
- one active application-level admin session per owner;
- 30-minute server-side inactivity timeout;
- revoked/expired Supabase `session_id` cannot reactivate an old admin session;
- fresh app-session activation requires recent password + TOTP AMR evidence;
- failures are fail-closed;
- Melhor Envio OAuth start is protected by authenticated AAL2 admin access;
- the old visible/manual `MELHOR_ENVIO_OAUTH_ADMIN_SECRET` gate is removed;
- Melhor Envio callback remains provider-callable and protected by one-shot hashed OAuth state;
- TOTP recovery has no in-app bypass and is manual through Supabase administration.

### Preview provisioning / database evidence

- Supabase project has exactly one Auth user;
- exactly one TOTP factor exists and it is verified;
- `admin_sessions` migration is applied;
- `admin_sessions` and its RPCs are backend/service-role only;
- repeated logins from PC/mobile kept only one active admin session at a time;
- historical admin-session rows are revoked rather than reused.

Applied Admin Auth migration:

7. `admin_sessions` / committed file `202608310001_admin_sessions.sql`

### Live Preview acceptance evidence

First-time and repeated login were exercised against the real Preview:

- password login succeeded;
- mandatory TOTP was enrolled and verified;
- `/api/admin/session/activate` returned HTTP `204` for valid AAL2 activation;
- invalid 6-digit TOTP was rejected in the UI and created no new admin-session row;
- logout returned HTTP `303` and the previous application-level session was revoked;
- subsequent login required password + Authenticator again;
- repeated PC/mobile logins continued to leave only one active admin session.

The 30-minute inactivity rule was verified against the live Preview/Sandbox database by aging the active row by 31 minutes and invoking the exact `authorize_admin_session` RPC used by the server guard. It returned `expired`, revoked the row, and left `0` active admin sessions. The protected-page redirect/fail-closed path is additionally covered by the automated admin-auth regression suite.

### Browser/runtime issues found during acceptance and fixed

Two real browser-only issues were found and fixed before acceptance:

1. CSP initially blocked browser calls to Supabase Auth. `connect-src` now permits only the exact configured Supabase HTTPS origin, not a wildcard.
2. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` were initially accessed dynamically, which was not safe for Next.js browser bundling. They now use statically analyzable `process.env.NEXT_PUBLIC_*` references and are present in the real client bundle.

The admin UI was also separated from the storefront shell:

- `/admin/*` no longer renders the public Navbar, FAQ, footer, floating cart or cart panel;
- the admin area has its own responsive visual shell/dashboard;
- the public storefront still renders its normal chrome.

### Melhor Envio through the authenticated admin

The protected admin integration flow was exercised successfully in Preview/Sandbox.

Vercel runtime evidence included:

- `POST /api/internal/melhor-envio/oauth/start` → HTTP `303`;
- `GET /api/melhor-envio/oauth/callback` → HTTP `303`;
- `GET /admin/integrations/melhor-envio` → HTTP `200`.

Supabase credential evidence after that authorization:

- environment `sandbox`;
- status `active`;
- token version `7`;
- access-token expiry `2026-09-30 12:15:07+00`;
- no refresh lease held;
- no recorded auth failure.

No manual admin-secret field is part of this flow anymore.

## Production provider fail-closed guard — COMPLETE

Production runtime now refuses to use Sandbox provider modes for both payment and freight.

Rules:

- Vercel `VERCEL_ENV=preview` may continue using Mercado Pago Sandbox and Melhor Envio Sandbox even though Next.js builds with `NODE_ENV=production`;
- Vercel `VERCEL_ENV=production` requires `MERCADO_PAGO_ENVIRONMENT=production` and `MELHOR_ENVIO_ENVIRONMENT=production`;
- outside Vercel, `NODE_ENV=production` is the fallback Production signal and enforces the same requirement;
- a mismatched Production/Sandbox configuration throws before provider work, failing closed;
- Production provider configuration remains allowed when both provider modes are `production`.

Regression coverage lives in `tests/production-provider-env.test.ts` and explicitly covers Preview, Vercel Production and non-Vercel Production behavior.

## Production environment preparation — MANUALLY ENTERED, NOT RUNTIME-VALIDATED

The owner reported entering the required Production environment values directly in Vercel on 2026-08-31. Secret values were not shared in chat or committed.

### Melhor Envio Production

The separate Production application has been created. The following Production-only configuration is reported present in Vercel:

- `MELHOR_ENVIO_ENVIRONMENT=production`;
- `MELHOR_ENVIO_CLIENT_ID`;
- `MELHOR_ENVIO_CLIENT_SECRET` as secret;
- `MELHOR_ENVIO_REDIRECT_URI=https://www.proxybembem.com.br/api/melhor-envio/oauth/callback`;
- `MELHOR_ENVIO_USER_AGENT`;
- `SHIPPING_ORIGIN_CEP`;
- fresh `MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY` secret;
- fresh `SHIPPING_QUOTE_SECRET` secret;
- fresh `CRON_SECRET` secret.

Do not reuse Sandbox Client ID, Client Secret, tokens or the fresh Production-only secrets above. Only `shipping-calculate` remains authorized; label purchase/generation/printing stays manual. Production freight accepts only Correios service IDs `1/2` (PAC/SEDEX).

### Production base / Supabase

The following Production values are also reported present in Vercel:

- `NEXT_PUBLIC_SITE_URL=https://www.proxybembem.com.br`;
- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
- `ADMIN_USER_ID`;
- `SUPABASE_URL`;
- `SUPABASE_SECRET_KEY` as secret;
- fresh `RATE_LIMIT_SECRET` as secret.

### Mercado Pago Production

The following Production values are reported present in Vercel:

- `MERCADO_PAGO_ENVIRONMENT=production`;
- `MERCADO_PAGO_ACCESS_TOKEN` as secret;
- `MERCADO_PAGO_WEBHOOK_SECRET` as secret.

The Production webhook URL configured for the integration is:

`https://www.proxybembem.com.br/api/mercadopago/webhook`

These entries have **not yet been validated by a Production deployment/runtime**. Do not call Production ready merely because the variables were entered.

## Melhor Envio Production preparation — APP CREATED, NOT AUTHORIZED

The Production rollout procedure is pinned in `docs/shipping-setup.md` and protected by `tests/melhor-envio-config-docs.test.ts`.

Production decisions that must not be rediscovered:

- canonical public domain is `https://www.proxybembem.com.br`;
- exact Melhor Envio Production callback is `https://www.proxybembem.com.br/api/melhor-envio/oauth/callback`;
- Production uses a separate Melhor Envio application, Client ID and Client Secret;
- the owner manually created the Melhor Envio Production application on 2026-08-31;
- credentials/secrets were entered directly in the Vercel Production environment and still require runtime validation;
- no real credential value belongs in chat, screenshots, commits or docs;
- Preview/Sandbox credentials stay intact;
- no Melhor Envio Production OAuth authorization has been completed yet.

TDD evidence for this runbook preparation:

- RED commit `320383393448a72851f936b4d7e645b4f23d89c3`;
- CI `#622` failed with 213 passing / 1 failing test because the exact Production callback was not yet documented;
- GREEN commit `3472cfcf394d038941414f214b0e66e4040bf748` updated only the runbook;
- CI `#624` passed tests, typecheck and build;
- Vercel Preview deployment `dpl_6SKEfLSGkL6a6Na24i7RDWp9AWeS` is `READY`;
- stable Preview branch alias remains unchanged.

## Completed checkout / shipping work

### `3.1.11d` — local fallback validation — COMPLETE

Validated locally:

- full Melhor Envio single-account OAuth lifecycle;
- OAuth state SHA-256, 10-minute TTL and one-shot consumption;
- OAuth tokens encrypted with AES-256-GCM before Supabase persistence;
- automatic token refresh with lease + compare-and-set;
- protected maintenance refresh/Cron path;
- real Melhor Envio Sandbox quote;
- checkout shipping requote;
- Mercado Pago Sandbox preference creation;
- checkout retry/idempotency;
- concurrent checkout behavior;
- Supabase order/preference persistence;
- tests, typecheck and build.

### `3.1.11d.18d` — Mercado Pago concurrent preference race — COMPLETE

A live local race that could create two preferences was fixed with the Supabase checkout-preference lease migration:

- `202608300001_checkout_preference_lease.sql`

The same checkout attempt now reuses one order/preference and leaves no stale lease. Concurrency ownership is server/database-side.

### `3.1.11b` — Preview/Vercel checkout runtime acceptance — COMPLETE

Checkout/shipping acceptance completed on 2026-08-31.

Key live evidence retained from the accepted run:

- Melhor Envio Sandbox OAuth credential active;
- maintenance refresh/Cron authenticated path HTTP `200`;
- unauthenticated maintenance path HTTP `401`;
- quantity 1 quote: Jadlog `.Com` R$18.15 / 4 days and `.Package` R$22.08 / 5 days;
- quantity 2 quote: `.Package` R$25.06 / 5 days and `.Com` R$25.60 / 4 days;
- quantity 1 checkout order `PB-CC97DEC33CF1`, total R$138.05, retry reused the same order and checkout URL;
- quantity 2 checkout order `PB-D3A19617185E`, total R$264.86, retry reused the same order and checkout URL;
- checkout-preference leases cleared after completion;
- no temporary diagnostic endpoint belongs in Production.

The stable Sandbox callback/Preview redirect remains:

`https://proxybembem-git-feat-che-d3796d-brenobembemm1802-7300s-projects.vercel.app/api/melhor-envio/oauth/callback`

## Applied Preview/Sandbox migrations

1. `202608280001_create_orders.sql`
2. `202608280002_shipping_checkout_hardening.sql`
3. `202608280003_atomic_payment_events.sql`
4. `202608290001_restrict_rls_auto_enable.sql`
5. `202608290002_melhor_envio_oauth.sql`
6. `202608300001_checkout_preference_lease.sql`
7. `202608310001_admin_sessions.sql`

## Exact next project work

Do not rebuild completed Preview/Sandbox systems. Production values are entered but have not been runtime-validated.

Recommended continuation order:

1. Verify current branch HEAD and CI after this checkpoint commit.
2. Perform a controlled Vercel Production deployment from the reviewed checkout branch **without merging `main`** and verify the final domain resolves to that deployment.
3. Smoke-test the Production admin login/MFA and fail-closed environment loading without initiating a customer payment.
4. Authorize Melhor Envio Production through the MFA-protected admin and verify the stored credential is `production` + active without exposing tokens.
5. Perform a controlled Production freight quote and confirm only Correios PAC/SEDEX service IDs `1/2` are accepted.
6. Verify the Mercado Pago Production webhook endpoint/configuration and create a controlled real checkout only when the preceding freight/admin gates pass.
7. Perform one controlled real Production transaction and verify payment → webhook → order/database state.
8. Run the final whole-branch review and take PR #2 out of draft only when the Production rollout gate passes.
9. Merge to `main` only with explicit owner approval.
10. Only after checkout/payment/freight Production rollout is finished and validated, begin the planned KingHost migration.

## Post-checkout objective: KingHost

After checkout/payment/freight is finished and validated, the long-term goal is to migrate the services currently hosted by Vercel and Supabase to KingHost.

Vercel + Supabase remain the active development/validation platform until the checkout rollout is complete.

The future KingHost migration must inventory and replace, without weakening security:

- Next.js hosting/API routes;
- environment variables/secrets;
- PostgreSQL schema, migrations, data, RLS/grants and RPCs;
- leases/atomic order and payment operations;
- Supabase Auth / TOTP admin model;
- Cron replacement;
- Melhor Envio OAuth state/tokens/callbacks;
- Mercado Pago webhook/return URLs;
- DNS, TLS, backups, validation and rollback.

Do not assume KingHost has one-to-one equivalents for every Supabase feature; design that migration from the actual KingHost plan/capabilities when that phase begins.

## Documentation order for future sessions

1. Read this file first.
2. Verify actual branch HEAD, CI and Vercel state.
3. Read `docs/shipping-setup.md` for the current Melhor Envio/admin/Production runbook.
4. Read `docs/payments-setup.md` for Mercado Pago.
5. Use older files under `docs/superpowers/plans/` as historical implementation plans, not live progress trackers.

## End-of-session rule

Every meaningful session must update this file with:

- what passed/failed;
- any blocker;
- exact next action;
- relevant HEAD/deployment evidence;
- decisions future sessions must not rediscover.

**Resume point:** Production environment values for Melhor Envio, Supabase/base app and Mercado Pago were entered manually in Vercel with secrets kept out of chat. They are not yet runtime-validated. Next perform a controlled Production deployment from `feat/checkout-mercadopago` without merging `main`, then validate admin/MFA, authorize Melhor Envio Production, validate PAC/SEDEX quote, and only then run the controlled real Mercado Pago transaction.