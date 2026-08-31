# ProxyBembem Checkout — Current Status

**Updated:** 2026-08-31

This is the canonical continuation checkpoint. Read this file before older plan checkboxes.

## Repository / safety constraints

- Repo: `Bembemm/proxybembem`
- Active branch: `feat/checkout-mercadopago`
- PR `#2`: open/draft/unmerged unless freshly rechecked otherwise.
- `main` must never be merged without explicit owner approval.
- Production rollout is being done from the reviewed feature branch before any merge.
- Do not expose provider/Supabase secrets in chat, screenshots, logs, docs, or commits.
- KingHost migration remains deferred until checkout/payment/freight Production rollout and cleanup are complete.

## Production rollout status — END-TO-END PAYMENT ACCEPTED

Production checkout has now been validated end to end with a controlled low-value real transaction.

Validated in Production:

- final domain `https://www.proxybembem.com.br` is live;
- Admin login works with password + mandatory Authenticator TOTP/AAL2;
- Melhor Envio Production OAuth is authorized and stored credential is `production` + `active`;
- Production freight returns only Correios PAC/SEDEX service IDs `1/2`;
- Mercado Pago Production preference creation works and redirects to Checkout Pro;
- one real controlled payment completed successfully;
- Mercado Pago signed webhook was accepted with HTTP `200`;
- webhook code queried Mercado Pago by payment ID before applying state;
- Supabase order moved from `pending` to `approved` / `accredited`;
- payment ID was persisted;
- stored total matched the controlled checkout total;
- public `/pedido/<token>` page returned HTTP `200` after payment;
- no runtime error cluster was found for the accepted payment flow.

Controlled accepted order evidence:

- order: `PB-89CBF4CE747C`;
- trusted product subtotal: R$ 5,00;
- shipping: R$ 14,22;
- total: R$ 19,22;
- shipping carrier/service: Correios / SEDEX, service ID `2`;
- payment status: `approved`;
- payment status detail: `accredited`;
- real Mercado Pago payment ID stored in the order.

Historical pending test checkouts remain in the database and must not be confused with the accepted paid order. They do not imply a payment failure.

## Mercado Pago notification cleanup

During the real Production payment, the application received both valid signed Webhooks and legacy-style notifications to the same endpoint. Evidence showed:

- signed Mercado Pago Webhook requests returned HTTP `200` and successfully approved the order;
- additional unsigned/legacy notification attempts returned HTTP `401` because the endpoint correctly fails closed without a valid HMAC signature.

Root cause: the preference `notification_url` was sent without the Mercado Pago Webhooks-only selector, allowing legacy IPN-style delivery alongside Webhooks.

Fix implemented with TDD:

- RED commit: `6e11935fec7975ae88b6c419abe00279db647530`;
- RED CI `#650`: 218 tests passed and exactly the new Webhooks-only test failed because the old URL lacked `source_news=webhooks`;
- GREEN fix commit: `f9beda55879b1836fa55c3c8262c7dd99db2b3b6`;
- fix forces preference `notification_url` to include `source_news=webhooks`;
- GREEN CI `#652`: tests, typecheck and build all passed;
- Preview deployment for the fix was `READY`;
- owner promoted the fix to Production;
- Production deployment `dpl_8z8c6sN7B5iNL6o8uQzqAfqarKrB` is `READY`, target `production`, commit `f9beda55879b1836fa55c3c8262c7dd99db2b3b6`.

No second real payment is required solely to prove the already-successful payment transition; the Webhooks-only fix is regression-tested and deployed.

## Temporary R$ 5 validation product — CLEANUP IMPLEMENTED IN PREVIEW

The temporary low-value helper served its purpose and has now been removed from the feature branch.

Removed:

- trusted temporary catalog product ID `9001` / R$ 5,00;
- `validationOnly` product flag;
- `validationProduct`, `VALIDATION_PRODUCT_ID`, and temporary storefront filtering helpers;
- route `/validacao-pagamento`;
- route client helper that cleared/replaced the cart;
- validation-specific test file.

The real paid order history remains intact in Supabase; removing the temporary catalog entry does not delete or rewrite the accepted order.

Cleanup verification on branch HEAD before this documentation update:

- code HEAD: `9fcdd16478355680d40f2ef1dfd39f86d6740585`;
- CI `#664`: tests, typecheck and build all passed;
- Preview deployment `dpl_Hrr97cYawwf9T8n5mRmXD2Rotrvv` is `READY`;
- Preview `/validacao-pagamento` returns HTTP `404`;
- Preview `/produtos` returns HTTP `200` and shows exactly the two normal products.

Important: this cleanup is **not yet promoted to Production** at the moment this checkpoint is written. Production is still correctly running the Webhooks-only fix commit `f9beda...`, which still contains the hidden validation helper until the cleanup HEAD is promoted.

## Admin Auth

Admin Auth is complete and Production-smoke-tested.

Security model:

- one manually provisioned admin account;
- public signup disabled;
- authorization by immutable Supabase UUID via server-only `ADMIN_USER_ID`;
- password + mandatory TOTP Authenticator;
- AAL2 required for protected admin routes;
- no SMS fallback / trusted-device bypass;
- one active application-level session;
- 30-minute server-side inactivity timeout;
- fresh activation requires recent password + TOTP evidence;
- revoked/expired sessions cannot reactivate;
- failures are fail-closed;
- Melhor Envio OAuth start is protected by AAL2 admin access;
- callback uses one-shot hashed OAuth state.

Applied migration: `202608310001_admin_sessions.sql`.

## Melhor Envio Production

Validated:

- separate Production application/credentials;
- scope only `shipping-calculate`;
- credential stored encrypted in Supabase;
- DB state `production` + `active`;
- token version `1` at initial Production authorization;
- no token material exposed;
- Production service policy accepts only Correios PAC/SEDEX IDs `1/2`;
- quote endpoint produced successful HTTP `200` requests after authorization;
- label purchase/generation remains manual and is not part of this checkout flow.

## Production environment

Required Production environment values were entered directly in Vercel. Secret values were never committed or shared in chat.

Key groups present:

- Base/Supabase: `NEXT_PUBLIC_SITE_URL`, public Supabase URL/publishable key, server Supabase URL/secret key, `ADMIN_USER_ID`, `RATE_LIMIT_SECRET`;
- Mercado Pago: `MERCADO_PAGO_ENVIRONMENT=production`, Production access token, Production webhook secret;
- Melhor Envio: Production environment, client ID/secret, canonical callback, user agent, origin CEP, encryption key, quote secret, cron secret.

Production fail-closed guard remains active: Vercel Production requires both provider environments to be `production`; mismatches fail before provider work.

## Applied migrations

1. `202608280001_create_orders.sql`
2. `202608280002_shipping_checkout_hardening.sql`
3. `202608280003_atomic_payment_events.sql`
4. `202608290001_restrict_rls_auto_enable.sql`
5. `202608290002_melhor_envio_oauth.sql`
6. `202608300001_checkout_preference_lease.sql`
7. `202608310001_admin_sessions.sql`

## Exact next project work

1. Wait for CI/Preview on this documentation HEAD to be green/`READY`.
2. Promote the latest cleanup-containing Preview deployment to Vercel Production **without merging `main`**.
3. Confirm Production is `READY` on the cleanup-containing HEAD and final domain still returns HTTP `200`.
4. Confirm Production `/validacao-pagamento` returns `404` and `/produtos` exposes only the two normal products.
5. Run a final whole-branch review/checklist of checkout, Mercado Pago webhook, Melhor Envio freight, Admin Auth, security headers/env rules, and docs. No new real payment is required for routine code review unless a later change materially alters payment processing.
6. If final review passes, take PR `#2` out of draft if desired.
7. Merge to `main` only with explicit owner approval.
8. Only after the checkout branch is finalized should the planned KingHost migration begin.

## End-of-session rule

Every meaningful session must update this file with passed/failed evidence, blockers, exact next action, relevant HEAD/deployment evidence, and decisions future sessions must not rediscover.

**Resume point:** real Mercado Pago Production payment acceptance passed end to end. Webhooks-only notification fix `f9beda...` is already live in Production. Temporary R$ 5 validation code has been completely removed on the feature branch and cleanup CI `#664`/Preview passed at `9fcdd...`. Next promote the latest cleanup-containing HEAD to Production, verify the route is gone on the live domain, then perform final whole-branch review. Never merge `main` without explicit owner approval.
