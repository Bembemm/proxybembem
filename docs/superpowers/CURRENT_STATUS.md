# ProxyBembem Checkout — Current Status

**Updated:** 2026-08-31

This is the canonical continuation checkpoint. Read this file before older plan checkboxes.

## Repository / safety constraints

- Repo: `Bembemm/proxybembem`
- Active branch: `feat/checkout-mercadopago`
- PR `#2`: `feat: adicionar checkout seguro com Mercado Pago`, base `main`.
- Never merge `main` without explicit owner approval.
- No provider, Supabase, password or TOTP secrets belong in chat, screenshots, logs, docs or commits.
- Production rollout was deliberately performed from the reviewed feature branch before merge.
- KingHost migration remains deferred until this checkout branch is finalized and the owner decides the merge/integration step.

## Production rollout — COMPLETE

Checkout, freight, admin authentication and payment have been validated end to end on the final domain.

Validated in Production:

- `https://www.proxybembem.com.br` is live;
- Admin login works with password + mandatory Authenticator TOTP/AAL2;
- Melhor Envio Production OAuth is authorized and the stored Production credential is active;
- Production freight exposes only Correios PAC/SEDEX service IDs `1/2`;
- Mercado Pago Production creates a Checkout Pro preference successfully;
- one legitimate controlled low-value real payment completed successfully;
- a signed Mercado Pago Webhook returned HTTP `200`;
- the webhook queried Mercado Pago by payment ID before applying state;
- the Supabase order moved from `pending` to `approved`, detail `accredited`;
- the public `/pedido/<token>` page returned HTTP `200` after payment;
- no runtime error/fatal cluster was found around the accepted flow.

The controlled acceptance transaction used a temporary R$ 5 validation item plus real SEDEX, totaling R$ 19,22. The temporary item and route have since been completely removed. Historical test/pending orders remain as database history and must not be confused with the accepted payment.

## Mercado Pago Webhooks-only cleanup — COMPLETE

During the controlled real payment, valid signed Webhooks were accepted with HTTP `200`, while additional legacy-style unsigned notifications reached the same endpoint and correctly failed HMAC validation with `401`.

Root cause: the preference `notification_url` did not yet request Webhooks-only delivery.

Fix:

- RED commit `6e11935fec7975ae88b6c419abe00279db647530`;
- GREEN fix commit `f9beda55879b1836fa55c3c8262c7dd99db2b3b6`;
- `notification_url` now includes `source_news=webhooks`;
- CI `#652` passed tests, typecheck and build;
- fix was promoted to Production successfully.

No second real payment was required solely for this notification-selector change because the payment transition itself was already proven end to end and the selector change has regression coverage.

## Temporary R$ 5 validation helper — REMOVED EVERYWHERE

The temporary payment-validation helper served its purpose and is no longer part of the live application.

Removed from the feature branch:

- temporary trusted catalog product ID `9001`;
- `validationOnly` support and validation-only storefront helpers;
- `/validacao-pagamento`;
- temporary cart helper;
- validation-specific test file.

Final cleanup verification:

- cleanup code commit before documentation checkpoint: `9fcdd16478355680d40f2ef1dfd39f86d6740585`;
- cleanup CI `#664` passed tests, typecheck and build;
- documentation checkpoint commit `f31925a5ab3cbba02f7a5fba572318b2dcccac8b` had CI `#666` success;
- final cleanup Production deployment: `dpl_3cywxYxepJpAJCWnZ6jLQzQFb7Xb`;
- deployment target `production`, state `READY`;
- deployed commit `f31925a5ab3cbba02f7a5fba572318b2dcccac8b`;
- aliases include `www.proxybembem.com.br` and `proxybembem.com.br`;
- Production `/validacao-pagamento` returns HTTP `404`;
- Production `/produtos` returns HTTP `200` and shows only the two normal products;
- error/fatal runtime-log check after the final promotion returned no entries.

Removing the temporary catalog entry did not delete or rewrite the accepted paid order in Supabase.

## Admin Auth — COMPLETE

Security model:

- one manually provisioned admin account;
- public signup disabled;
- authorization by immutable Supabase UUID through server-only `ADMIN_USER_ID`;
- email/password + mandatory TOTP Authenticator;
- AAL2 required for protected admin access;
- no SMS fallback or trusted-device bypass;
- one active application-level admin session per user;
- strict 30-minute server/database inactivity timeout;
- fresh activation requires recent password + TOTP evidence;
- revoked/expired sessions cannot regain access;
- auth/session/storage failures fail closed;
- Melhor Envio OAuth start requires valid AAL2 admin access;
- provider callback remains public but uses short-lived one-shot hashed OAuth state.

Applied migration: `202608310001_admin_sessions.sql`.

## Melhor Envio Production — COMPLETE

Validated:

- separate Production application/credentials;
- minimum scope `shipping-calculate` only;
- access/refresh tokens stored encrypted in Supabase;
- Production credential active;
- Production service policy permits only Correios PAC/SEDEX IDs `1/2`;
- live quote endpoint returned successful Production quotes;
- token refresh uses lease/version CAS protections;
- label purchase/generation remains manual and is outside this checkout flow.

## Production environment / fail-closed rules

Required Production environment values are configured in Vercel. Secret values were entered directly and were not committed.

Groups:

- Base/Supabase: canonical site URL, public Supabase URL/publishable key, server Supabase URL/secret key, `ADMIN_USER_ID`, `RATE_LIMIT_SECRET`;
- Mercado Pago: `MERCADO_PAGO_ENVIRONMENT=production`, Production access token and Production webhook secret;
- Melhor Envio: Production environment, client ID/secret, canonical callback, user agent, origin CEP, token-encryption key, quote secret and cron secret.

Fail-closed provider guard remains active: Vercel Production requires both provider environments to be `production`; provider-environment mismatches fail before provider work.

## Applied migrations

1. `202608280001_create_orders.sql`
2. `202608280002_shipping_checkout_hardening.sql`
3. `202608280003_atomic_payment_events.sql`
4. `202608290001_restrict_rls_auto_enable.sql`
5. `202608290002_melhor_envio_oauth.sql`
6. `202608300001_checkout_preference_lease.sql`
7. `202608310001_admin_sessions.sql`

## Final whole-branch review — PASSED

A final high-risk review was performed after Production cleanup.

Reviewed areas included:

- checkout route and server-authoritative order reconstruction;
- quote token/cart fingerprint and live requote behavior;
- checkout attempt idempotency and Mercado Pago preference lease/concurrency;
- Mercado Pago checkout URL validation;
- Webhook HMAC validation, provider lookup and atomic payment-state RPC;
- payment amount/currency mismatch handling;
- Melhor Envio environment/service restrictions and token refresh;
- OAuth state/callback protections;
- Admin UUID/AAL2/TOTP/session/inactivity controls;
- server environment fail-closed behavior;
- rate limiting and bounded request bodies;
- CSP/HSTS/security headers;
- relevant Supabase SECURITY DEFINER/RLS/service-role migrations;
- repository secret hygiene.

Result: no blocking technical finding was identified. Searches for common real credential patterns did not find committed Production credentials. PR review threads are empty. Production error/fatal runtime logs after the final cleanup deployment were empty.

The PR description was refreshed after review to include all seven migrations, Admin Auth/MFA, completed Production acceptance, the Webhooks-only fix and removal of the temporary validation helper.

## PR / integration state

PR `#2` is open and mergeable. At the time immediately before this checkpoint commit it was still a draft and unmerged.

The next safe integration steps are:

1. Let CI and Preview finish for this documentation-only checkpoint commit.
2. If green/`READY`, mark PR `#2` ready for review.
3. Do **not** merge to `main` until the owner explicitly approves the merge.
4. After the owner decides/finalizes the branch integration, begin the planned KingHost migration as a separate risk-isolated phase.

This checkpoint commit changes documentation only; it does not require another real payment or another Production promotion to validate runtime behavior.

## End-of-session rule

Every meaningful session must update this file with passed/failed evidence, blockers, exact next action, relevant HEAD/deployment evidence, and decisions future sessions must not rediscover.

**Resume point:** Production payment/freight/Admin rollout is accepted, the Webhooks-only fix is live, and the temporary R$ 5 helper is removed from Production. Final branch review found no blocker. Wait for CI/Preview on this documentation checkpoint, then mark PR #2 ready for review if green. Never merge `main` without explicit owner approval.