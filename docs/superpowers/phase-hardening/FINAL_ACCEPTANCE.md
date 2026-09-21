# Site Hardening Final Acceptance

Date: 2026-09-16
Branch: `hardening/site-security-nonce`

## Owner environment decision

On 2026-09-16 the owner confirmed that the current `main`/Vercel/Supabase environment is intentionally being used as the sandbox environment. A separate Supabase project will not be created for this phase.

This owner decision supersedes the earlier acceptance assumption that the hardening branch could only be merged after validation in a separate isolated Vercel/Supabase sandbox. The merge to `main` is now part of the sandbox validation flow, not a production launch.

The current environment must remain explicitly configured as sandbox while acceptance is in progress:

- `APP_ENVIRONMENT=sandbox`;
- `MERCADO_PAGO_ENVIRONMENT=sandbox` with test credentials only;
- `MELHOR_ENVIO_ENVIRONMENT=sandbox` with sandbox credentials only;
- `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false`;
- `RATE_LIMIT_TRUSTED_PROXY_HOPS=0` until the real Vercel forwarding chain is measured;
- sandbox/test data in the current Supabase project is allowed during this phase.

Promotion to real production is a separate explicit operation. Before that promotion, the owner intends to clear the saved sandbox/test data from the same Supabase project. The production promotion checklist must also switch provider environments/credentials/webhooks, set `APP_ENVIRONMENT=production`, confirm the final public URL, rotate sandbox-only secrets where appropriate, re-run the Security Advisor, and perform the production smoke checklist before enabling any real-money or real-label action.

## Repository implementation status

The repository implementation for CSP/nonce, proxy-aware rate limiting, lint/CI, SEO and strong password policy is complete.

The Supabase Auth dashboard gate is owner-verified:

- minimum password length = 8;
- lowercase + uppercase + digits + symbols required;
- email confirmation enabled;
- hosted Auth rate limits reviewed;
- Leaked Password Protection remains unavailable on the Free plan and is an accepted warning;
- CAPTCHA remains off because no challenge integration is implemented;
- IP Address Forwarding remains off because application-side proxy trust is handled separately.

The live Supabase Security Advisor was reviewed after these settings. Existing RLS/no-policy informational findings and the two authenticated SECURITY DEFINER RPC warnings remain intentionally classified; the RPCs derive identity from `auth.uid()` and are not executable by `anon`.

## Repository verification evidence

The hardening code candidate `b44520780b79071fdbc19fdfedec166134d51509` completed GitHub Actions CI successfully after the repository became public.

Verified gates include:

- exact Vercel Node runtime `22.1.0`;
- `pnpm install --frozen-lockfile`;
- `pnpm lint` with zero warnings;
- `pnpm typecheck`;
- `pnpm build`;
- private-order route contract;
- Vercel runtime smoke;
- explicit critical commerce/security subset;
- full test suite.

## Remaining sandbox acceptance after merge to `main`

The merge to `main` is authorized by the owner specifically because `main` is still the sandbox environment. The following runtime checks still need to be completed on the deployed Vercel sandbox before promotion to production:

- [ ] deployed SHA matches the reviewed `main` SHA;
- [ ] `APP_ENVIRONMENT=sandbox`;
- [ ] Mercado Pago and Melhor Envio both use sandbox credentials/endpoints;
- [ ] `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false`;
- [ ] `RATE_LIMIT_TRUSTED_PROXY_HOPS=0` initially;
- [ ] storefront loads with no breaking CSP console violations;
- [ ] CSP contains a nonce and `script-src` has no `'unsafe-inline'`;
- [ ] two page requests receive different nonce values;
- [ ] signup -> email confirmation -> login succeeds;
- [ ] cart/checkout/shipping quote works against sandbox integrations;
- [ ] Mercado Pago test redirect/payment/webhook completes without real money;
- [ ] private customer order is visible only to its owner;
- [ ] admin login + MFA/AAL2 and critical admin pages work;
- [ ] no real Melhor Envio label is purchased;
- [ ] actual Vercel proxy chain is measured before setting a non-zero trusted-hop value.

## Production promotion gate

Do not treat the current merge as a production launch. Production is authorized only after the sandbox runtime checklist above passes and the environment is deliberately promoted from sandbox to production with the provider credentials, callbacks/webhooks, data cleanup, secret review/rotation and final smoke checks completed.