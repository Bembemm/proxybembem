# ProxyBembem Checkout — Current Status

**Updated:** 2026-08-31

This is the canonical continuation checkpoint. Read this file before using old plan checkboxes.

## Repository

- Repo: `Bembemm/proxybembem`
- Branch: `feat/checkout-mercadopago`
- PR: `#2` — open, draft, not merged
- Functional checkout/OAuth tree was completed through `803d1483ff2c59d067520044477758900be659c9`.
- `1b8dc27a61dab32cb326f9c7713a550b09728431` was an empty Vercel retrigger with the same functional tree.
- Subsequent documentation/diagnostic commits do not represent new checkout functionality.
- Never merge `main` without explicit owner approval.
- Current phase: **Preview/Sandbox**, not Production.

## Completed historical work

### `3.1.11d` — local fallback validation — COMPLETE

This was done while Vercel Preview was blocked by the build-rate limit.

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
- `pnpm test`, typecheck and build.

### `3.1.11d.18d` — Mercado Pago concurrent preference race — COMPLETE

A live local race could create two preferences. It was fixed with the Supabase checkout-preference lease migration:

- `202608300001_checkout_preference_lease.sql`

Final behavior validated locally: same checkout attempt reuses one order/preference and leaves no stale lease.

The implementation intentionally no longer relies on Mercado Pago `X-Idempotency-Key`; concurrency ownership is server/database-side.

## Current task

### `3.1.11b` — Preview/Vercel runtime acceptance — BLOCKED ON PREVIEW ENV

The old Vercel build-rate block is resolved. Current work is validating the already-tested functional tree in real Preview runtime.

### Preview checks already passed

- Vercel Preview deploys are building and reaching `READY`.
- GitHub CI was confirmed successful before the latest temporary diagnostics.
- Storefront `/` returns HTTP 200.
- `/admin/integrations/melhor-envio` returns HTTP 200.
- Existing approved order page successfully reads the trusted Supabase snapshot and renders payment/product/freight/address data.
- Supabase project is `ACTIVE_HEALTHY` in `sa-east-1`.
- Melhor Envio credential row in Supabase is `sandbox`, `active`, token version 5, access token expiry 2026-09-29, no refresh lease and no recorded auth failure.
- Recent checkout orders have no stale checkout-preference lease.
- Unauthenticated maintenance refresh returns HTTP 401 as designed.
- Current build/runtime checks did not expose unrelated application errors.

## Current blocker discovered on 2026-08-31

A temporary Preview-only acceptance probe was deployed to execute the real handlers inside Vercel, because the connected Vercel fetch action itself can only issue GET requests.

The probe called the real `/api/shipping/quote` handler for quantity 1 and quantity 2. Both returned HTTP 503 before checkout could start.

Safe diagnostics established:

- `VERCEL_ENV = preview`
- `MELHOR_ENVIO_ENVIRONMENT = sandbox`
- base shipping configuration loads successfully;
- the Melhor Envio OAuth token manager cannot initialize;
- all required OAuth env variable names are present;
- `MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY` is present but **does not match the required 64-hex-character format**;
- `MELHOR_ENVIO_OAUTH_ADMIN_SECRET` length is valid;
- `MELHOR_ENVIO_REDIRECT_URI` is an absolute URL.

Therefore the immediate Preview failure is configuration, not the shipping CEP/service logic and not Mercado Pago.

### Important encryption-key rule

`MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY` must be exactly 256 bits represented as **64 hexadecimal characters**.

Do not replace it with a new key blindly. The OAuth tokens currently stored in Supabase were encrypted with the key that existed when authorization succeeded.

Preferred recovery:

1. If the original 64-hex key used during the successful local/OAuth setup still exists in the owner's local environment or password manager, set that **same key** as the Vercel Preview `MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY`.
2. Redeploy Preview.
3. Re-run the Preview acceptance quote.
4. If the original key has been lost, create a new valid 64-hex key in the owner's secure environment, configure it in Vercel Preview, then perform a new Melhor Envio Sandbox OAuth authorization so fresh tokens are encrypted with the new key.

Never paste this key in chat, docs, commits or screenshots.

The connected Vercel tooling in this chat can inspect deployments/logs but cannot edit project environment variables, so this env correction requires the owner/Vercel dashboard (or another authorized Vercel environment-management surface).

## Exact next action

**Fix only the Preview value of `MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY` first. Do not move to Production and do not rebuild OAuth code.**

After the corrected key is deployed, resume `3.1.11b` in this order:

1. Real Preview quote quantity 1; expect HTTP 200 and only Sandbox-allowed service IDs `3/4`.
2. Real Preview quote quantity 2.
3. Checkout quantity 1: quote → requote → Mercado Pago Sandbox preference.
4. Retry the exact same checkout attempt; verify same order and same checkout URL.
5. Checkout quantity 2.
6. Open resulting order/return page.
7. Verify Supabase: no duplicate order/preference and no stale preference lease.
8. Authenticated Cron/refresh test using the deployed `CRON_SECRET` without exposing it.
9. Final Vercel runtime-log review.
10. Mark `3.1.11b` complete only after all checks pass.

## Applied Preview/Sandbox migrations

1. `202608280001_create_orders.sql`
2. `202608280002_shipping_checkout_hardening.sql`
3. `202608280003_atomic_payment_events.sql`
4. `202608290001_restrict_rls_auto_enable.sql`
5. `202608290002_melhor_envio_oauth.sql`
6. `202608300001_checkout_preference_lease.sql`

## Melhor Envio OAuth vs site admin Auth

These are separate:

- **Melhor Envio OAuth:** implemented and locally validated.
- **Site `/admin` login with Supabase Auth:** not implemented yet. The admin integration page still uses `MELHOR_ENVIO_OAUTH_ADMIN_SECRET` as the owner bootstrap mechanism.

Do not describe the Melhor Envio OAuth implementation as incomplete because Supabase Auth for `/admin` is still future work.

## After Preview acceptance

Do not begin these until `3.1.11b` passes unless the owner explicitly changes priority:

- Supabase Auth-based admin login/session;
- Production runtime/provider hardening to prevent accidental Sandbox provider configuration in Vercel Production;
- separate Melhor Envio Production credentials/OAuth;
- verify Production shipping exposes Correios IDs `1/2` (PAC/SEDEX), otherwise fail closed;
- separate Mercado Pago Production credentials/webhook;
- controlled first real transaction and webhook/database verification;
- take PR #2 out of draft only after final review;
- merge `main` only with explicit owner approval.

## Post-checkout objective: KingHost

The long-term destination is KingHost after checkout/payment/freight is finished and validated. Vercel + Supabase remain the active development/validation platform for now.

The later migration must inventory and replace, without weakening security:

- Next.js hosting/API routes;
- environment variables/secrets;
- PostgreSQL schema, migrations, data, RLS/grants and RPCs;
- leases/atomic order and payment operations;
- Supabase Auth if implemented by then;
- Cron replacement;
- Melhor Envio OAuth state/tokens/callbacks;
- Mercado Pago webhook/return URLs;
- DNS, TLS, backups, validation and rollback.

Do not assume KingHost has one-to-one equivalents for every Supabase feature; design that migration from the actual KingHost plan/capabilities at that future point.

## Documentation order for future sessions

1. Read this file first.
2. Verify the actual branch HEAD and current Vercel state.
3. Read `docs/shipping-setup.md` for the current Melhor Envio runbook.
4. Read `docs/payments-setup.md` for Mercado Pago.
5. Use older files under `docs/superpowers/plans/` as historical implementation plans, not as live progress trackers.

## End-of-session rule

Every meaningful session must update this file with:

- what passed/failed;
- any blocker;
- exact next action;
- relevant HEAD/deployment evidence;
- decisions future sessions must not rediscover.

**Resume point:** `3.1.11b` is blocked only by the invalid Preview `MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY` configuration. Fix that env first, then restart at Preview quote quantity 1.