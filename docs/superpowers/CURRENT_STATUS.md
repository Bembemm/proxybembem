# ProxyBembem Checkout — Current Status

**Updated:** 2026-08-31

This is the canonical continuation checkpoint. Read this file before using old plan checkboxes.

## Repository

- Repo: `Bembemm/proxybembem`
- Branch: `feat/checkout-mercadopago`
- PR: `#2` — open, draft, not merged
- Never merge `main` without explicit owner approval.
- Current rollout phase: **Preview/Sandbox accepted, including Admin Auth/MFA; Production provider guard implemented; Melhor Envio Production runbook prepared; Production app manually created**.
- Melhor Envio Production credentials/provider authorization are not configured yet.
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

A first Vercel build of this change exposed only a TypeScript issue in the new test helper because Next's env typing treats `NODE_ENV` as readonly. The runtime guard itself was not the cause. The test helper was corrected to manipulate an indexed env record; no Production runtime logic was weakened.

## Melhor Envio Production preparation — APP CREATED, NOT AUTHORIZED

The Production rollout procedure is pinned in `docs/shipping-setup.md` and protected by `tests/melhor-envio-config-docs.test.ts`.

Production decisions that must not be rediscovered:

- canonical public domain is `https://www.proxybembem.com.br`;
- exact Melhor Envio Production callback is `https://www.proxybembem.com.br/api/melhor-envio/oauth/callback`;
- Production uses a separate Melhor Envio application, Client ID and Client Secret;
- the owner manually created the Melhor Envio Production application on 2026-08-31;
- its credentials have not yet been configured in the Production environment and must never be pasted into chat;
- do not reuse Sandbox Client ID, Client Secret, tokens or server-side secrets;
- Production must generate its own `MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY`, `SHIPPING_QUOTE_SECRET`, `CRON_SECRET` and other server-side secrets;
- only `shipping-calculate` remains authorized; label purchase/generation/printing stays manual;
- Production freight accepts only Correios service IDs `1/2` (PAC/SEDEX), with no fallback to unexpected services;
- Preview/Sandbox credentials stay intact while Production is prepared;
- no real credential value belongs in chat, screenshots, commits or docs.

TDD evidence for this runbook preparation:

- RED commit `320383393448a72851f936b4d7e645b4f23d89c3`;
- CI `#622` failed with 213 passing / 1 failing test because the exact Production callback was not yet documented;
- GREEN commit `3472cfcf394d038941414f214b0e66e4040bf748` updated only the runbook;
- CI `#624` passed tests, typecheck and build;
- Vercel Preview deployment `dpl_6SKEfLSGkL6a6Na24i7RDWp9AWeS` is `READY`;
- stable Preview branch alias remains unchanged.

No Melhor Envio Production authorization has been completed yet, and no Production credential value has been stored by the application yet.

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

Admin Auth and checkout/shipping are accepted in Preview/Sandbox, the Production/Sandbox provider mismatch guard is implemented, the Melhor Envio Production runbook is ready, and the separate Production application has been manually created. Do not rebuild those completed subsystems when resuming.

Recommended continuation order:

1. Configure the Melhor Envio Production application's Client ID/Client Secret and fresh Production-only secrets directly in the Production secret store, with `MELHOR_ENVIO_ENVIRONMENT=production`; never paste secret values into chat.
2. Keep `MELHOR_ENVIO_REDIRECT_URI=https://www.proxybembem.com.br/api/melhor-envio/oauth/callback` exactly and leave Preview/Sandbox variables untouched.
3. Authorize Melhor Envio through the MFA-protected admin and verify the stored credential is `production` + active without exposing tokens.
4. Perform a controlled Production freight quote and confirm only Correios PAC/SEDEX service IDs `1/2` are accepted.
5. Configure separate Mercado Pago Production credentials/webhook and the final public site URL.
6. Perform one controlled real Production transaction and verify payment → webhook → order/database state.
7. Run the final whole-branch review and take PR #2 out of draft only when the Production rollout gate passes.
8. Merge to `main` only with explicit owner approval.
9. Only after checkout/payment/freight Production rollout is finished and validated, begin the planned KingHost migration.

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

**Resume point:** Admin Auth/MFA and checkout/shipping are complete in Preview/Sandbox, Production provider fail-closed hardening is complete, the Melhor Envio Production rollout runbook is ready, and the separate Production application has been manually created. Next configure its Production-only credentials/secrets directly in the Production environment, then authorize it; do not merge to `main` without explicit owner approval.