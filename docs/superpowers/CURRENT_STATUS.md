# ProxyBembem Checkout — Current Status

**Updated:** 2026-08-31

This is the canonical continuation checkpoint. Read this file before old plan checkboxes.

## Repository

- Repo: `Bembemm/proxybembem`
- Branch: `feat/checkout-mercadopago`
- PR `#2`: open, draft, not merged.
- Never merge `main` without explicit owner approval.
- `main` remains untouched.
- Current branch HEAD before this checkpoint update: `eddf124bde59b515faabf524f1c46ad13aa8e80a`.

## Current rollout phase

Production is live on the final domain and has passed Admin Auth/MFA, Melhor Envio Production OAuth, PAC/SEDEX freight, and Mercado Pago Production checkout-preference creation. A real payment/webhook transition has **not** been completed yet.

The owner correctly declined to use the R$ 135,06 checkout as the payment-validation transaction. A temporary hidden R$ 5,00 validation product has therefore been implemented and verified in Preview. **That validation-product commit has not yet been promoted/redeployed to Production.**

Validated in Production on the currently live deployment:

- final domain `https://www.proxybembem.com.br` returns HTTP `200`;
- Admin login works with password + mandatory Authenticator TOTP;
- Melhor Envio Production OAuth authorization completed successfully;
- stored Melhor Envio credential is `production` + `active`, token version `1`, with no auth failure and no refresh lease held;
- Preview/Sandbox Melhor Envio credential remains separately active;
- Production freight quote works and exposes only Correios PAC/SEDEX service IDs `1/2`;
- multiple `/api/shipping/quote` calls returned HTTP `200` after authorization;
- Mercado Pago Production checkout preference creation returned HTTP `201` and opened Checkout Pro;
- no real payment has been completed yet.

## Current Production deployment evidence

The currently live Production deployment is still:

- deployment `dpl_C2642ZG5NJofEitrwXoGkpD9gw1t`;
- target `production`;
- source branch `feat/checkout-mercadopago`;
- deployed code commit `c5dea101151e37394bd25beec942b8cec5b0f9b7`;
- state `READY`;
- aliases include `www.proxybembem.com.br` and `proxybembem.com.br`;
- CI `#630` for that deployed commit completed successfully.

Do not claim the temporary R$ 5 validation product is live in Production until a Production deployment is confirmed on commit `eddf124bde59b515faabf524f1c46ad13aa8e80a` or a later commit that contains the same change.

## Temporary R$ 5 payment-validation product — IMPLEMENTED IN PREVIEW, TEMPORARY

Purpose: validate one legitimate real Mercado Pago Production payment and the webhook/database transition without risking the normal R$ 119,90 product subtotal.

Approved bounded design:

- trusted catalog product ID `9001`;
- title `Validação de pagamento`;
- exact trusted product price R$ 5,00;
- same shipping dimensions/weight as the deck (`0.5 kg`, `25x19x4 cm`) so PAC/SEDEX remains part of the real flow;
- marked `validationOnly`;
- excluded from home/featured products and `/produtos`;
- accessible only by knowing `/validacao-pagamento`; there is no storefront navigation link;
- route has `noindex, nofollow`;
- opening the validation helper and clicking `Usar produto de validação` clears the existing cart first, then adds only product `9001`;
- server remains authoritative: `buildCheckoutOrder` reconstructs product ID `9001` as exactly `500` cents from the trusted catalog;
- no database migration/table was added for this temporary helper;
- after end-to-end payment acceptance, remove the product, route/client helper, `validationOnly` support if no longer needed, and the validation-specific regression test.

TDD evidence:

- RED test commit `912447ee753d1cbb42cf64ced91415ceb8412d6e`;
- CI `#636` failed as expected with exactly the four new validation checks failing because the product/filter/route did not yet exist;
- implementation commits: `4117e687...`, `2c3a3b05...`, `70947813...`, `5b948c70...`, `eddf124b...`;
- GREEN CI `#646` run `33411906588` completed successfully: tests, typecheck and build all passed.

Latest Preview evidence:

- deployment `dpl_GBmH7LdhgQwJ5dSKnxuKQPo4d3eB`;
- commit `eddf124bde59b515faabf524f1c46ad13aa8e80a`;
- branch `feat/checkout-mercadopago`;
- state `READY`;
- stable branch alias unchanged;
- `/validacao-pagamento` returns HTTP `200`, visibly shows R$ 5,00, and emits `noindex, nofollow` / `x-robots-tag: noindex`;
- `/produtos` returns HTTP `200` and shows exactly the two normal products; the validation product/category is not exposed there.

This helper is intentionally temporary. Do **not** forget to delete it after the real payment/webhook acceptance is complete.

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

Applied Admin Auth migration: `202608310001_admin_sessions.sql`.

## Production environment

The required Production values were entered directly in Vercel. Secret values were not shared in chat or committed.

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

- Vercel Preview may use Sandbox providers;
- Vercel Production requires both provider environments to be `production`;
- outside Vercel, `NODE_ENV=production` enforces the same requirement;
- mismatches fail before provider work.

Regression coverage: `tests/production-provider-env.test.ts`.

## Melhor Envio Production acceptance

Production OAuth acceptance:

- admin authorized through `/admin/integrations/melhor-envio` at AAL2;
- database Production credential is `active`;
- token version `1`;
- no refresh lease;
- no recorded auth failure;
- no token/envelope value was exposed.

Production freight acceptance:

- storefront displayed only Correios PAC/SEDEX;
- accepted service IDs are `1/2` only;
- multiple Production `/api/shipping/quote` requests returned HTTP `200`;
- two provider `422` attempts occurred during manual testing but were followed by successful quotes and an accepted PAC/SEDEX storefront result.

## Mercado Pago Production checkout — PREFLIGHT PASSED, PAYMENT NOT YET DONE

First controlled Production checkout, intentionally left unpaid:

- `POST /api/checkout` returned HTTP `201`;
- order `PB-353342240711`;
- payment provider `mercadopago`;
- payment status `pending`;
- Mercado Pago preference ID and checkout URL exist;
- shipping `Correios / SEDEX`, service ID `2`;
- shipping R$ 15,16;
- total R$ 135,06;
- checkout preference lease cleared;
- Checkout Pro opened successfully;
- no payment was completed.

Do not confuse that pending R$ 135,06 order with the future R$ 5 validation-product order.

Do not call Mercado Pago Production fully accepted until one real controlled payment is completed and webhook → provider lookup → atomic order transition is verified.

## Preview/Sandbox historical acceptance

Completed earlier:

- checkout/shipping runtime acceptance;
- Melhor Envio Sandbox OAuth lifecycle;
- token encryption and refresh lease/CAS;
- checkout retry/idempotency;
- Supabase order/preference persistence;
- concurrent Mercado Pago preference race fixed with `202608300001_checkout_preference_lease.sql`;
- Admin Auth/MFA Preview acceptance.

Applied migrations:

1. `202608280001_create_orders.sql`
2. `202608280002_shipping_checkout_hardening.sql`
3. `202608280003_atomic_payment_events.sql`
4. `202608290001_restrict_rls_auto_enable.sql`
5. `202608290002_melhor_envio_oauth.sql`
6. `202608300001_checkout_preference_lease.sql`
7. `202608310001_admin_sessions.sql`

## Exact next project work

1. Promote/redeploy the verified Preview commit `eddf124bde59b515faabf524f1c46ad13aa8e80a` to Vercel **Production** without merging `main`.
2. Verify the resulting Production deployment is `READY`, points to that exact commit (or a later equivalent), and owns the canonical domain aliases.
3. Verify `https://www.proxybembem.com.br/validacao-pagamento` returns HTTP `200`, shows R$ 5,00 and remains `noindex`; verify `/produtos` still shows only the two normal products.
4. Use the validation page to clear the cart/add only product `9001`, calculate PAC/SEDEX and create a new low-value Production checkout.
5. Before paying, confirm the new database order has subtotal exactly R$ 5,00 plus the selected real freight.
6. Complete one legitimate real Mercado Pago Production payment.
7. Verify Vercel `/api/mercadopago/webhook`, signature validation, Mercado Pago provider lookup, amount/currency checks, atomic Supabase order transition and public order-page state.
8. After that acceptance passes, remove all temporary R$ 5 validation-product code/tests and verify the branch again.
9. Run final whole-branch review; take PR `#2` out of draft only after the Production rollout gate passes.
10. Merge to `main` only with explicit owner approval.
11. Only after checkout/payment/freight Production rollout and temporary-test cleanup are complete, begin the planned KingHost migration.

## Post-checkout objective: KingHost

Do not start migration yet. Vercel + Supabase remain the active platform until Production checkout/payment/freight validation is complete.

## End-of-session rule

Every meaningful session must update this file with what passed/failed, blockers, exact next action, relevant HEAD/deployment evidence, and decisions future sessions must not rediscover.

**Resume point:** temporary R$ 5 validation product is implemented and verified in Preview at `eddf124...` with CI `#646` green and Preview deployment `dpl_GBmH7LdhgQwJ5dSKnxuKQPo4d3eB` READY. Production is still on the older `c5dea101...` deployment. Next redeploy/promote `eddf124...` to Production, verify the hidden route/public-storefront split, then perform the low-value real payment and webhook validation. Never merge `main` without explicit owner approval.