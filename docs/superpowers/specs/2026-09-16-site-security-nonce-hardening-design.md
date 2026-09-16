# Site Security, Nonce CSP, Quality and SEO Hardening

Date: 2026-09-16
Branch: `hardening/site-security-nonce`
Base: `main`

## Goal

Harden ProxyBembem without changing production directly. The work combines security headers/CSP with request nonces, safer proxy-aware rate limiting, real linting in CI, technical SEO improvements, regression coverage for critical commerce flows, and no-cost Supabase Auth hardening.

The branch must remain isolated until all acceptance checks pass. No production deployment or merge into `main` is implied by this work.

## Non-goals

- No change to financial authority or pricing logic.
- No change to Mercado Pago totals, payment ownership, reconciliation rules, or webhook trust model.
- No change to Melhor Envio label-purchase safety gates.
- No production credential changes in source control.
- No paid Supabase feature requirement.
- No automatic production deploy.

## 1. CSP with per-request nonce

### Current state

The application currently sends CSP from `next.config.mjs` and allows `script-src 'self' 'unsafe-inline'`.

### Target state

Use a cryptographically random nonce per HTML request and remove `'unsafe-inline'` from `script-src`.

The request proxy becomes responsible for creating the nonce and attaching the request-specific CSP. The response must include the same nonce-backed CSP.

The nonce must be generated with a cryptographically secure primitive and encoded safely for use in a CSP directive.

### Proxy separation

The current `proxy.ts` only runs on routes that need Supabase session handling. The nonce requires broader HTML coverage, but Supabase session refresh must not be performed for every public request unnecessarily.

Implementation must separate two concerns:

1. CSP/nonce generation for applicable page requests.
2. Supabase session/auth processing only for the routes that currently require it.

Public requests that do not need Supabase auth must not incur an avoidable auth lookup merely because CSP now uses a nonce.

### Dynamic rendering impact

Nonce-based CSP is request-specific and can force dynamic rendering for affected pages. This is accepted as part of Option B, but the implementation must minimize unnecessary dynamic behavior and document any measurable change in output or caching behavior.

### CSP compatibility

The final CSP must continue to support:

- ProxyBembem application assets;
- configured Supabase browser origin;
- Supabase public product images;
- Melhor Envio sandbox/production form action as configured;
- Next.js runtime behavior required by the current application.

`script-src` must not contain `'unsafe-inline'` in the accepted implementation.

`style-src 'unsafe-inline'` is outside the primary nonce objective and may remain if required by the current Next/Tailwind/runtime stack. It must not be silently removed if doing so breaks rendering.

## 2. Proxy-aware rate limiting

### Current state

Rate limiting is stored centrally in Supabase and derives a bucket from the first usable `x-forwarded-for` or `x-real-ip` value. The current parser checks length but does not validate that the candidate is a valid IP address.

### Target state

Keep the existing Supabase-backed rate-limit storage and existing scope policies unless tests show a reason to change a limit.

Add a dedicated client-IP parser that:

- validates IPv4 and IPv6 values;
- rejects malformed or arbitrary strings;
- handles `X-Forwarded-For` chains defensively;
- supports an explicit trusted-proxy-hop configuration suitable for the KingHost reverse-proxy environment;
- has a deterministic fallback when the trusted client IP cannot be established;
- never treats a free-form attacker-controlled header string as a valid client identity.

The KingHost proxy behavior must not be invented. The implementation must document the assumed trust boundary and keep it configurable where necessary.

Add unit tests for valid IPv4, valid IPv6, malformed values, multiple forwarded hops, missing headers, and spoof-like header input.

## 3. Real linting and CI quality gates

### Current state

`pnpm lint` and `pnpm typecheck` both run `tsc --noEmit`.

### Target state

Configure ESLint for the current Next.js 16 project, including `eslint-config-next/core-web-vitals` and TypeScript support appropriate to the repository.

Scripts must have distinct responsibilities:

- `lint`: ESLint/static quality checks;
- `typecheck`: TypeScript type checking;
- `test`: current Node test suite;
- `build:kinghost`: exact KingHost production-style build path.

CI must require at least:

1. frozen dependency install;
2. real lint;
3. typecheck;
4. `build:kinghost`;
5. existing KingHost startup/private-route contracts;
6. full test suite.

Rules must not be disabled simply to make CI green. Any suppression must be narrow, justified, and documented if unavoidable.

## 4. Technical SEO

Preserve existing metadata and add missing technical SEO without exposing private routes.

### Root metadata

Add or verify:

- `metadataBase` for the canonical production site;
- canonical URL behavior;
- Open Graph metadata;
- Twitter/social-card metadata;
- existing icons and `pt-BR` language behavior.

### Robots and sitemap

Add framework-native `robots.ts` and `sitemap.ts`.

The sitemap should include only public, indexable routes that are stable and useful to search engines.

Do not include private/customer/admin/auth/checkout routes.

### Noindex review

Keep admin `noindex, nofollow` behavior and review these categories for explicit noindex where appropriate:

- `/admin/**`;
- `/minha-conta/**`;
- `/checkout`;
- login/signup/password-recovery flows;
- other private or transactional-only pages.

## 5. Supabase Auth hardening without paid features

`Leaked Password Protection` remains disabled because it requires Supabase Pro or higher. This is an accepted known limitation and must be documented, not treated as a failing acceptance criterion.

The project should use the strongest reasonable no-cost Auth settings that are compatible with the current account flow.

### Password policy

Target:

- minimum password length of at least 8 characters;
- strong character requirements where supported and compatible with the UI;
- application-side validation/messages aligned with the server policy so users are not surprised by server rejection.

Changing the password policy must not lock existing users out merely because an old password is weaker; existing Supabase behavior should be preserved and verified.

### Email confirmation

Verify email confirmation is enabled for customer accounts in production. The checkout flow already requires authenticated users; verified-email behavior must remain compatible with that flow.

### Password changes and recovery

Review the current password reset/change flow against Supabase's available reauthentication/current-password options. Enable stronger free settings only if the current UI/server flow supports them or is updated in the same branch.

Do not enable a dashboard setting that would silently break the existing password-change flow.

### Auth abuse controls

Review Supabase Auth rate-limit settings and keep application-level rate limiting in place.

Evaluate CAPTCHA/Turnstile for sign-up, sign-in, and recovery abuse prevention. If enabling it requires frontend/server changes, those changes belong in this branch and must be tested before the Supabase dashboard setting is enabled.

### Supabase Security Advisor

Run Security Advisor before and after the work.

The paid-feature warning `Leaked Password Protection Disabled` is allowed to remain.

Other findings must be classified explicitly as one of:

- intentional and safe by design;
- fixed in this branch;
- outside scope with documented rationale.

In particular, existing RLS-with-no-policy findings on server-only tables must not be “fixed” by adding broad browser policies. Existing customer-facing `SECURITY DEFINER` RPCs must be reviewed for explicit ownership checks and grants before any change is proposed.

## 6. Commerce and auth regression protection

This hardening must not alter the server-authoritative commerce model.

Regression coverage must protect at least:

- product/cart navigation contracts affected by dynamic rendering/CSP;
- account login/session handling;
- checkout authentication requirement;
- shipping quote flow;
- Mercado Pago safe redirect contract;
- Mercado Pago webhook signature/authoritative payment fetch behavior;
- private customer order routes;
- Melhor Envio OAuth/form-action compatibility;
- KingHost standalone startup adapter.

No test should weaken a security condition merely to preserve an old behavior.

## 7. Testing strategy

Use test-driven changes for behavior modifications where practical.

Add targeted tests before or alongside implementation for:

- nonce format and per-request uniqueness;
- CSP contains the expected nonce and omits `script-src 'unsafe-inline'`;
- public pages can receive CSP without unnecessary Supabase auth lookup;
- Supabase-protected routes still preserve cookie/session behavior;
- client-IP parsing and proxy-hop behavior;
- robots/sitemap private-route exclusions;
- metadata contracts where stable to test;
- CI lint command no longer aliases typecheck.

Run the existing test suite unchanged as a regression safety net.

## 8. Acceptance criteria

The branch is ready for review only when all of the following are true:

- `script-src` no longer contains `'unsafe-inline'`;
- nonce is generated per request and used consistently in request/response CSP;
- public CSP handling does not force unnecessary Supabase auth work;
- Supabase-protected routes still authenticate and refresh sessions correctly;
- malformed forwarded-IP headers are not accepted as valid rate-limit identities;
- real ESLint is configured and required by CI;
- TypeScript typecheck remains separate;
- technical SEO includes metadata base, canonical/social metadata, robots, and sitemap;
- private/auth/admin/checkout routes are excluded from indexing as designed;
- no-cost Supabase Auth security settings are reviewed and aligned with the app;
- the paid leaked-password warning is documented as accepted;
- `pnpm lint` passes;
- `pnpm typecheck` passes;
- `pnpm test` passes;
- `pnpm build:kinghost` passes on the expected runtime contract;
- existing checkout/payment/shipping/auth security tests continue to pass;
- Security Advisor is re-run and findings are reviewed.

## 9. Production validation before merge/deploy

Because current `main` has moved beyond the previously production-accepted runtime, branch acceptance is not equivalent to production acceptance.

Before production deployment, perform a sandbox/preview smoke covering:

1. storefront loads with no CSP violations that break functionality;
2. account signup/confirmation/login;
3. product to cart;
4. authenticated checkout;
5. shipping quote via Melhor Envio sandbox;
6. Mercado Pago sandbox checkout redirect;
7. payment webhook processing;
8. private customer order visibility;
9. admin login/MFA and critical admin pages;
10. no real label purchase or production payment during sandbox validation.

Use the existing KingHost sandbox runbook and separate sandbox Supabase/provider credentials.

## 10. Rollback

No automatic deployment occurs from this branch.

If nonce CSP causes rendering, compatibility, or unacceptable performance regressions, keep the branch isolated and leave `main`/production unchanged.

If an Auth dashboard hardening setting causes a regression during sandbox validation, revert that setting and update the code/spec before considering production rollout.

Merge only after code review and all acceptance checks pass.

## Security invariants preserved

- Browser code does not become authoritative for price, freight, totals, ownership, or payment status.
- Mercado Pago remains financial authority.
- Webhook processing continues to validate source/signature and fetch authoritative payment data.
- Melhor Envio label purchase remains fail-closed unless explicitly enabled.
- Customer order access remains owner-scoped.
- Admin protection remains owner UUID + password + MFA/AAL2 + active application session as currently designed.
- Supabase secret/service credentials remain server-only.
- Production and sandbox credentials/data remain isolated.
