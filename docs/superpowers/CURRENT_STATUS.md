# ProxyBembem Checkout — Current Status

**Updated:** 2026-08-31

This is the canonical continuation checkpoint. Read this file before older plan checkboxes.

## Repository / safety constraints

- Repo: `Bembemm/proxybembem`
- Active branch: `feat/checkout-mercadopago`
- PR `#2`: `feat: adicionar checkout seguro com Mercado Pago`, base `main`, open and ready for review.
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

## Storefront consolidation — PREVIEW VALIDATED, NOT YET PRODUCTION

The owner approved consolidating the small product catalog into the home page instead of keeping a separate full products experience.

Approved behavior:

- home is the main storefront and renders the complete trusted product catalog;
- the hero now leads directly into the product section;
- product section uses anchor `#produtos` and the navbar `Produtos` item points to `/#produtos`;
- legacy `/produtos` redirects to `/#produtos`;
- product cards are larger/more interactive and show discount percentage plus savings;
- 60-card deck remains R$ 69,99 checkout price but now advertises an original R$ 99,99 crossed-out price;
- Commander remains R$ 150,00 → R$ 119,90.

TDD evidence:

- RED commit `3e748b94f3f2fdb606921db7be664924a1b4e00e`;
- RED CI `#670`: 219 tests total, 215 passed and exactly four new storefront-contract tests failed for the four missing behaviors;
- price commit `e7d66cbe27e2d42e20a54d849f6018cd670fb851`;
- home storefront commit `db413273c203d3c565657266e74eed19cdbda5eb`;
- navbar anchor commit `7edb873e6b1db29d611ce97244de8d97fbe470ab`;
- `/produtos` redirect commit `b9af67934e1f38c97e48d93dc50b9852cc63d362`;
- GREEN CI `#678` passed `pnpm test`, `pnpm typecheck` and `pnpm build`.

Preview evidence for code HEAD `b9af67934e1f38c97e48d93dc50b9852cc63d362`:

- deployment `dpl_BVW7RMaWhJSarYSnncsSx2vGJEQ5` is `READY`;
- Preview `/` returned HTTP `200` and rendered both real products;
- 60-card card displayed R$ 99,99 crossed out, R$ 69,99 current price, `-30%`, and `Economize R$ 30,00`;
- Commander displayed R$ 150,00 crossed out, R$ 119,90 current price, `-20%`, and `Economize R$ 30,10`;
- navbar `Produtos` points to `/#produtos`;
- Preview `/produtos` resolved to the home storefront as designed.

Important: this storefront consolidation has **not** been promoted to Production yet. Production remains on the previously accepted cleanup deployment/commit until the owner explicitly approves/promotes the new Preview. The trusted server checkout price for product ID 2 remains R$ 69,99 because checkout uses `discountPrice`; only the displayed original/reference price changed.

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

PR `#2` is open, mergeable, ready for review, and unmerged. Its branch now also contains the Preview-validated storefront consolidation described above.

The next safe steps are:

1. Wait for CI/Preview on this documentation-only checkpoint HEAD.
2. If green/`READY`, ask the owner for explicit Production promotion approval for the storefront consolidation.
3. After promotion, verify the final domain home shows both products/prices and `/produtos` redirects to the home product section.
4. Update this checkpoint with Production evidence.
5. Do **not** merge to `main` until the owner explicitly approves the merge.
6. Only after branch finalization should the planned KingHost migration begin as a separate risk-isolated phase.

No new real Mercado Pago payment is required for this storefront-only change because the trusted discounted checkout price of the 60-card product remains R$ 69,99 and payment/freight processing code was not changed.

## End-of-session rule

Every meaningful session must update this file with passed/failed evidence, blockers, exact next action, relevant HEAD/deployment evidence, and decisions future sessions must not rediscover.

**Resume point:** checkout/payment/freight/Admin Production acceptance remains complete. A new home-as-storefront change is GREEN in CI `#678` and Preview `dpl_BVW7RMaWhJSarYSnncsSx2vGJEQ5` at code commit `b9af679...`; it is not yet live in Production. Wait for CI/Preview on this documentation checkpoint, then ask for explicit Production promotion approval. Never merge `main` without explicit owner approval.
