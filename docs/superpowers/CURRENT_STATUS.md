# ProxyBembem Checkout — Current Status

**Updated:** 2026-08-31

This is the canonical continuation checkpoint. Read this file before old plan checkboxes.

## Repository

- Repo: `Bembemm/proxybembem`
- Branch: `feat/checkout-mercadopago`
- PR `#2`: open, draft, not merged.
- Never merge `main` without explicit owner approval.
- `main` remains untouched.

## Current rollout phase

Production has been deployed from the checkout branch and is live on the final domain.

Validated in Production:

- final domain `https://www.proxybembem.com.br` returns HTTP `200`;
- Admin login works with password + mandatory Authenticator TOTP;
- Melhor Envio Production OAuth authorization completed successfully;
- stored Melhor Envio credential is `production` + `active`, token version `1`, with no auth failure and no refresh lease held;
- Preview/Sandbox Melhor Envio credential remains separately active;
- Production freight quote works and exposes only Correios PAC/SEDEX service IDs `1/2`;
- multiple `/api/shipping/quote` calls returned HTTP `200` after authorization;
- two quote attempts returned provider `422` during manual testing, followed by successful HTTP `200` quotes; the accepted storefront result displayed only PAC/SEDEX;
- Mercado Pago Production checkout preference creation has been validated up to the provider checkout page, but no real payment has been completed yet.

## Production deployment evidence

Controlled Production deployment:

- deployment `dpl_C2642ZG5NJofEitrwXoGkpD9gw1t`;
- target `production`;
- source branch `feat/checkout-mercadopago`;
- deployed code commit `c5dea101151e37394bd25beec942b8cec5b0f9b7`;
- state `READY`;
- aliases include `www.proxybembem.com.br` and `proxybembem.com.br`;
- CI `#630` for that deployed commit completed successfully.

## Admin Auth

Admin Auth is complete in Preview and smoke-tested in Production.

Security model:

- one manually provisioned admin account;
- public signup disabled;
- authorization by immutable Supabase user UUID through server-only `ADMIN_USER_ID`;
- password first factor;
- mandatory TOTP Authenticator second factor / AAL2;
- no SMS fallback or trusted-device bypass;
- one active application-level session;
- 30-minute server-side inactivity timeout;
- revoked/expired session IDs cannot reactivate;
- fresh activation requires recent password + TOTP AMR evidence;
- failures are fail-closed;
- Melhor Envio OAuth start is protected by AAL2 admin access;
- callback is provider-callable and protected by one-shot hashed OAuth state.

Applied Admin Auth migration:

- `202608310001_admin_sessions.sql`

## Production environment

The owner entered the required Production environment values directly in Vercel. Secret values were never shared in chat or committed.

### Melhor Envio Production

Present in Vercel Production:

- `MELHOR_ENVIO_ENVIRONMENT=production`;
- `MELHOR_ENVIO_CLIENT_ID`;
- `MELHOR_ENVIO_CLIENT_SECRET` as secret;
- `MELHOR_ENVIO_REDIRECT_URI=https://www.proxybembem.com.br/api/melhor-envio/oauth/callback`;
- `MELHOR_ENVIO_USER_AGENT`;
- `SHIPPING_ORIGIN_CEP`;
- fresh `MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY` secret;
- fresh `SHIPPING_QUOTE_SECRET` secret;
- fresh `CRON_SECRET` secret.

Production uses a separate Melhor Envio application and credentials. Only `shipping-calculate` is authorized; label purchase/generation/printing remains manual.

### Base / Supabase Production

Present in Vercel Production:

- `NEXT_PUBLIC_SITE_URL=https://www.proxybembem.com.br`;
- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
- `ADMIN_USER_ID`;
- `SUPABASE_URL`;
- `SUPABASE_SECRET_KEY` as secret;
- fresh `RATE_LIMIT_SECRET` as secret.

### Mercado Pago Production

Present in Vercel Production:

- `MERCADO_PAGO_ENVIRONMENT=production`;
- `MERCADO_PAGO_ACCESS_TOKEN` as secret;
- `MERCADO_PAGO_WEBHOOK_SECRET` as secret.

Webhook URL:

`https://www.proxybembem.com.br/api/mercadopago/webhook`

## Production provider fail-closed guard

Complete.

Rules:

- Vercel Preview may use Sandbox providers;
- Vercel Production requires both `MERCADO_PAGO_ENVIRONMENT=production` and `MELHOR_ENVIO_ENVIRONMENT=production`;
- outside Vercel, `NODE_ENV=production` enforces the same requirement;
- mismatches fail before provider work.

Regression coverage: `tests/production-provider-env.test.ts`.

## Melhor Envio Production acceptance

Production OAuth acceptance:

- admin opened `/admin/integrations/melhor-envio` while authenticated at AAL2;
- `Conectar Melhor Envio` completed successfully;
- database row for environment `production` is `active`;
- token version `1`;
- no refresh lease;
- no recorded auth failure;
- no token/envelope value was exposed.

Production freight acceptance:

- storefront displayed only Correios PAC/SEDEX;
- accepted service IDs are `1/2` only;
- multiple Production `/api/shipping/quote` requests returned HTTP `200`;
- the earlier Sandbox Jadlog services remain historical Preview evidence only and are not accepted in Production.

## Mercado Pago Production checkout — PREFLIGHT PASSED, PAYMENT NOT YET DONE

A controlled Production checkout was initiated only up to the Mercado Pago checkout page.

Evidence:

- `POST /api/checkout` returned HTTP `201` on the Production deployment;
- latest Production order created: `PB-353342240711`;
- payment provider: `mercadopago`;
- payment status: `pending`;
- Mercado Pago preference ID exists;
- checkout URL exists;
- shipping provider: `melhor_envio`;
- carrier: `Correios`;
- service ID `2` / `SEDEX`;
- delivery estimate: `2` days;
- shipping: R$ 15,16;
- order total: R$ 135,06;
- checkout preference lease is cleared;
- Mercado Pago Checkout Pro page opened successfully;
- no payment has been completed yet.

Do not call Mercado Pago Production fully accepted until one real controlled payment is completed and the webhook/order transition is verified.

## Preview/Sandbox historical acceptance

Completed earlier:

- checkout/shipping runtime acceptance;
- Melhor Envio Sandbox OAuth lifecycle;
- token encryption and refresh lease/CAS;
- checkout retry/idempotency;
- Supabase order/preference persistence;
- concurrent Mercado Pago preference race fixed with `202608300001_checkout_preference_lease.sql`;
- Admin Auth/MFA Preview acceptance.

Important historical commits:

- Admin Auth spec `9a377082983cb6535b8558a5ebdd93a48f454389`;
- Admin Auth plan `92d1656125ed90a56bc48f24e3a6f6fe69d54087`;
- Admin Auth implementation/tests `97cbefb6cc497363c0286f37fd09043d0cce343e`;
- Production provider guard GREEN `234018dfeebcf3d45589da295a2d10179c8d8d88`;
- provider-env test typing fix `cdceeb1fca43760b58197261825400ede82a6149`;
- Melhor Envio Production runbook GREEN `3472cfcf394d038941414f214b0e66e4040bf748`.

Applied migrations:

1. `202608280001_create_orders.sql`
2. `202608280002_shipping_checkout_hardening.sql`
3. `202608280003_atomic_payment_events.sql`
4. `202608290001_restrict_rls_auto_enable.sql`
5. `202608290002_melhor_envio_oauth.sql`
6. `202608300001_checkout_preference_lease.sql`
7. `202608310001_admin_sessions.sql`

## Exact next project work

1. Complete one controlled real Mercado Pago Production payment for the already-created pending checkout, using a legitimate buyer/payment method and not a prohibited self-payment setup.
2. After payment, verify Vercel `/api/mercadopago/webhook` runtime activity, signature validation, provider lookup and HTTP result.
3. Verify in Supabase that the exact Production order transitions from `pending` to the expected paid/approved state with payment ID, amount and currency checks passing.
4. Verify the public order page reflects the database state and not only redirect parameters.
5. If payment/webhook acceptance passes, run final whole-branch review and verification on the same HEAD.
6. Take PR `#2` out of draft only after the Production rollout gate passes.
7. Merge to `main` only with explicit owner approval.
8. Only after checkout/payment/freight Production rollout is fully validated, begin the planned KingHost migration.

## Post-checkout objective: KingHost

Do not start migration yet. Vercel + Supabase remain the active platform until Production checkout/payment/freight validation is complete.

The future migration must account for Next.js hosting/API routes, env/secrets, PostgreSQL schema/data/RLS/RPCs, auth/TOTP, cron, OAuth tokens/callbacks, Mercado Pago webhooks/returns, DNS/TLS, backups and rollback.

## End-of-session rule

Every meaningful session must update this file with what passed/failed, blockers, exact next action, relevant HEAD/deployment evidence, and decisions future sessions must not rediscover.

**Resume point:** Production deployment, Admin Auth/MFA, Melhor Envio OAuth and PAC/SEDEX freight are validated. Mercado Pago Production preference creation and redirect to Checkout Pro are validated with order `PB-353342240711` still `pending`. Next complete one controlled legitimate real payment, then verify webhook → provider lookup → database order transition. Never merge `main` without explicit owner approval.