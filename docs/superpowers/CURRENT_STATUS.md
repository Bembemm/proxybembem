# ProxyBembem Checkout — Current Status

**Updated:** 2026-08-31

This is the canonical continuation checkpoint. Read this file before using old plan checkboxes.

## Repository

- Repo: `Bembemm/proxybembem`
- Branch: `feat/checkout-mercadopago`
- PR: `#2` — open, draft, not merged
- Never merge `main` without explicit owner approval.
- Current rollout phase: **Preview/Sandbox accepted**. Production has not started.
- The permanent checkout/OAuth implementation predates the temporary Preview acceptance probes described below. Temporary diagnostic routes must not remain in the final branch tree.

## Completed historical work

### `3.1.11d` — local fallback validation — COMPLETE

Completed while Vercel Preview was blocked by the build-rate limit.

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

Final local behavior: the same checkout attempt reuses one order/preference and leaves no stale lease. The implementation intentionally no longer relies on Mercado Pago `X-Idempotency-Key`; concurrency ownership is server/database-side.

## `3.1.11b` — Preview/Vercel runtime acceptance — COMPLETE

Completed on 2026-08-31 after the Vercel build-rate block cleared.

### Configuration issue found and resolved

The first real Preview quote returned HTTP 503 because `MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY` in Preview was not in the required 64-hex-character format.

The owner generated and configured a new valid 256-bit/64-hex key in Vercel Preview. Because the previous Supabase OAuth token envelopes had been encrypted with a different key, they then correctly became unreadable (`invalid_credential`). A fresh Melhor Envio Sandbox OAuth authorization was performed against the stable Preview callback.

The Sandbox callback/Preview redirect is:

`https://proxybembem-git-feat-che-d3796d-brenobembemm1802-7300s-projects.vercel.app/api/melhor-envio/oauth/callback`

The fresh authorization succeeded. Supabase recorded:

- environment `sandbox`;
- credential status `active`;
- token version `6`;
- new access-token expiry `2026-09-30`;
- no refresh lease;
- no recorded auth failure.

The browser displayed an HTTP 401 after returning from the provider because of Preview navigation/protection, but Vercel logs proved the OAuth callback itself returned 303 and the admin page then returned 200. The Supabase token-version/timestamp update proves the authorization completed successfully.

### Final Preview acceptance evidence

A temporary route restricted to `VERCEL_ENV=preview` called the real shipping, checkout and refresh handlers inside Vercel. It returned only sanitized status/evidence and no secrets or quote tokens.

Acceptance deployment used for the final full run:

- deployment: `dpl_DtUFnq86a9nr5uJsEN23JoFzRvma`
- diagnostic commit: `7ad7192ab9fdb584f53e0d80d4b7d81c1b41af9d`
- state: `READY`

#### Melhor Envio token/Cron

- token manager: `ok=true`, token version `6`;
- authenticated maintenance refresh/Cron handler: HTTP `200`, `ok=true`;
- unauthenticated refresh had already been verified to return HTTP `401`.

#### Quantity 1 quote

HTTP `200`, Sandbox allowlist only:

- service `4` — Jadlog `.Com` — R$18.15 — 4 days;
- service `3` — Jadlog `.Package` — R$22.08 — 5 days.

#### Quantity 2 quote

HTTP `200`, Sandbox allowlist only:

- service `3` — Jadlog `.Package` — R$25.06 — 5 days;
- service `4` — Jadlog `.Com` — R$25.60 — 4 days.

#### Quantity 1 checkout + retry

- first request: HTTP `201`;
- order: `PB-CC97DEC33CF1`;
- Mercado Pago host: `www.mercadopago.com.br`;
- retry: HTTP `200`;
- retry returned the **same order** and **same checkout URL**.

Supabase verification:

- payment status `pending` (Sandbox test order, intentionally not paid);
- subtotal `R$119.90`;
- freight `R$18.15`;
- total `R$138.05`;
- selected service `4`;
- one persisted Mercado Pago preference;
- checkout URL persisted;
- checkout-preference lease cleared (`null`).

#### Quantity 2 checkout + retry

- first request: HTTP `201`;
- order: `PB-D3A19617185E`;
- Mercado Pago host: `www.mercadopago.com.br`;
- retry: HTTP `200`;
- retry returned the **same order** and **same checkout URL**.

Supabase verification:

- payment status `pending` (Sandbox test order, intentionally not paid);
- subtotal `R$239.80`;
- freight `R$25.06`;
- total `R$264.86`;
- selected service `3`;
- one persisted Mercado Pago preference;
- checkout URL persisted;
- checkout-preference lease cleared (`null`).

#### Runtime logs

The final Preview deployment had no warning/error/fatal runtime logs during the acceptance window.

### Cleanup requirement

The following routes were temporary diagnostics and must be absent after the cleanup commit:

- `app/api/internal/preview-acceptance/route.ts`
- `app/api/internal/preview-reauthorize/route.ts`
- `app/api/internal/preview-oauth-config-check/route.ts`

No temporary diagnostic endpoint belongs in Production.

## Applied Preview/Sandbox migrations

1. `202608280001_create_orders.sql`
2. `202608280002_shipping_checkout_hardening.sql`
3. `202608280003_atomic_payment_events.sql`
4. `202608290001_restrict_rls_auto_enable.sql`
5. `202608290002_melhor_envio_oauth.sql`
6. `202608300001_checkout_preference_lease.sql`

## Important distinction: Melhor Envio OAuth vs site admin Auth

- **Melhor Envio OAuth:** implemented and now validated both locally and in Preview.
- **Site `/admin` login with Supabase Auth:** not implemented. The admin integration page still uses `MELHOR_ENVIO_OAUTH_ADMIN_SECRET` as the owner bootstrap mechanism.

Do not rebuild Melhor Envio OAuth when resuming. Admin authentication is a separate next feature.

## Exact next project work

The old numbered sequence after `3.1.11b` was not reliably preserved, so do not invent a historical task number.

Recommended continuation order:

1. Design/implement **Supabase Auth for the site admin area** in Preview:
   - single owner/admin account;
   - no public signup;
   - authenticated session for `/admin/*`;
   - replace the visible `MELHOR_ENVIO_OAUTH_ADMIN_SECRET` form;
   - protect Melhor Envio OAuth start with authenticated admin authorization;
   - preserve callback state protection and public checkout behavior.
2. Verify Admin Auth with tests, CI and Preview runtime.
3. Add Production runtime/provider hardening so Vercel Production fails closed if Mercado Pago or Melhor Envio is accidentally configured as Sandbox.
4. Configure separate Melhor Envio Production app/credentials/OAuth and verify Production returns Correios service IDs `1/2` (PAC/SEDEX); fail closed otherwise.
5. Configure separate Mercado Pago Production credentials/webhook and the final public site URL.
6. Perform one controlled real Production transaction and verify payment → webhook → order/database state.
7. Final review; take PR #2 out of draft only when the full rollout gate passes.
8. Merge to `main` only with explicit owner approval.

## Post-checkout objective: KingHost

After checkout/payment/freight is finished and validated, the long-term goal is to migrate the services currently hosted by Vercel and Supabase to KingHost.

Vercel + Supabase remain the active development/validation platform until the checkout rollout is complete.

The future KingHost migration must inventory and replace, without weakening security:

- Next.js hosting/API routes;
- environment variables/secrets;
- PostgreSQL schema, migrations, data, RLS/grants and RPCs;
- leases/atomic order and payment operations;
- Supabase Auth if implemented by then;
- Cron replacement;
- Melhor Envio OAuth state/tokens/callbacks;
- Mercado Pago webhook/return URLs;
- DNS, TLS, backups, validation and rollback.

Do not assume KingHost has one-to-one equivalents for every Supabase feature; design that migration from the actual KingHost plan/capabilities when that phase begins.

## Documentation order for future sessions

1. Read this file first.
2. Verify actual branch HEAD, CI and Vercel state.
3. Read `docs/shipping-setup.md` for the current Melhor Envio runbook.
4. Read `docs/payments-setup.md` for Mercado Pago.
5. Use older files under `docs/superpowers/plans/` as historical implementation plans, not live progress trackers.

## End-of-session rule

Every meaningful session must update this file with:

- what passed/failed;
- any blocker;
- exact next action;
- relevant HEAD/deployment evidence;
- decisions future sessions must not rediscover.

**Resume point:** `3.1.11b` is complete. Start with the bounded Supabase Auth admin design/implementation in Preview; do not move to Production yet.