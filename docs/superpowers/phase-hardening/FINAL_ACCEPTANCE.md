# Site Hardening Final Acceptance

Date: 2026-09-16
Branch: `hardening/site-security-nonce`
Final repository candidate verified by CI: `b0a2f6ce405dd66a7c1841dbc94d2524015fc49f`

This document is the final evidence ledger for the four approved hardening plans. It intentionally separates repository verification from external production/sandbox acceptance. A repository-green result does not by itself authorize merge or deployment.

## Current merge-readiness status

**NOT YET MERGE-READY.**

Repository implementation for CSP/nonce, proxy-aware rate limiting, lint/CI, SEO and the application-side password policy is present and the final repository candidate has a complete green CI run. The remaining blockers are external Supabase Auth dashboard verification and isolated KingHost sandbox acceptance.

## Repository implementation status

### Plan 1 — CSP nonce / proxy separation

Repository implementation: **complete**.

Verified in source/tests:

- per-request cryptographic CSP nonce;
- `script-src` does not use `'unsafe-inline'`;
- `style-src 'unsafe-inline'` intentionally remains;
- CSP is mirrored into upstream request headers and the downstream response;
- public page CSP does not force Supabase Auth work on every public request;
- Supabase session refresh rebuilds upstream headers after cookie mutation while preserving the same nonce/CSP values;
- static CSP was removed from `next.config.mjs` to avoid duplicate/conflicting policies;
- page rendering is request-time so nonce CSP is compatible with Next.js;
- Mercado Pago/Melhor Envio/Supabase origins required by the application remain represented in the CSP builder.

External acceptance still required: observe actual HTTP CSP headers, nonce rotation and browser console behavior on the isolated KingHost sandbox.

### Plan 2 — rate-limit proxy IP

Repository implementation: **complete**.

Verified in source/tests:

- IPv4/IPv6 validation;
- defensive `X-Forwarded-For` chain parsing;
- hop selection from the trusted/right side of the chain;
- malformed/insufficient chains fail closed;
- `x-real-ip` is used only when forwarding headers are explicitly trusted;
- `RATE_LIMIT_TRUSTED_PROXY_HOPS` is bounded to `0..5`;
- default is `0`, so an unverified deployment ignores forwarding identity and collapses to the deterministic `unknown` bucket;
- raw IPs are not stored in Supabase; the existing HMAC bucket remains the stored identity;
- existing per-scope limits/windows were not changed.

External acceptance still required: verify the actual KingHost forwarding topology on the sandbox host before using any non-zero hop count. Leaving the production/sandbox value at `0` remains the safe fallback.

### Plan 3 — lint / CI / SEO

Repository implementation: **complete**, with deliberate deviations documented in `PLAN_RECONCILIATION.md`.

Verified in source:

- ESLint 9 is a real gate separate from TypeScript typecheck;
- Next Core Web Vitals and Next TypeScript rules are enabled;
- CI order is frozen install -> lint -> typecheck -> KingHost build -> route/startup smoke -> critical commerce/security subset -> full suite;
- root metadata has canonical URL resolution plus Open Graph/Twitter metadata;
- the existing square 192x192 `/brand/pb` asset uses Twitter `summary`, not `summary_large_image`;
- public pages declare their own canonical paths;
- `/trocas-e-reembolsos` is intentionally included as the sixth public canonical sitemap route;
- admin/account/checkout/auth/recovery surfaces are noindex/nofollow;
- sandbox has site-wide noindex behavior;
- `robots.txt` and `sitemap.xml` are forced dynamic so runtime `APP_ENVIRONMENT` controls indexing behavior.

### Plan 4 — Supabase Auth / final acceptance

Repository-side application policy: **complete**.

Verified in source/tests:

- new passwords require 8..128 characters;
- at least one lowercase letter, uppercase letter, digit and allowed symbol;
- signup, password update and recovery use the shared strong validator on client/server paths;
- login input intentionally remains length-bounded so legacy credentials are not rejected by the application parser before Supabase evaluates them;
- user-facing password-policy errors describe requirements without disclosing account existence;
- application-level signup/login/reset/recovery/profile rate limits remain enabled;
- existing admin TOTP MFA/AAL2 boundary is unchanged.

## Live Supabase Security Advisor review

Project reviewed: `ProxyBembem` (`kicgoocozxzkuoqajqif`).

Live Advisor state reviewed on 2026-09-16:

1. `auth_leaked_password_protection` — WARN.
   - accepted known limitation;
   - Leaked Password Protection is disabled;
   - Supabase documents this as Pro Plan and above.

2. `rls_enabled_no_policy` — INFO on 16 tables.
   - live privilege inspection confirmed `anon` and `authenticated` do not have direct DML privileges on the reported tables;
   - no permissive RLS policy was added merely to silence the Advisor.

3. `authenticated_security_definer_function_executable` — WARN on two customer RPCs.
   - `customer_get_order(p_order_id uuid)` and `customer_list_orders(p_limit integer, p_offset integer)` are intentionally executable by `authenticated` and not by `anon`;
   - both use fixed `search_path = ''`;
   - both derive customer identity from `auth.uid()` and constrain returned orders by that identity;
   - pagination is bounded in `customer_list_orders`.

Detailed evidence and the full table list are recorded in `SUPABASE_AUTH_SECURITY.md`.

## Supabase Auth dashboard gate

Status: **OWNER DASHBOARD VERIFICATION REQUIRED**.

The available Supabase connector can inspect database/advisor state but does not expose a hosted Auth configuration read/mutation action. Therefore these settings are not claimed as verified:

- [ ] Minimum password length = `8`.
- [ ] Required characters = lowercase + uppercase + digits + symbols.
- [ ] Email confirmation enabled.
- [ ] Auth rate limits reviewed for compatibility with the application flow.
- [ ] Leaked Password Protection remains OFF unless the project is upgraded and the owner chooses to enable it.
- [ ] CAPTCHA remains OFF unless provider credentials plus frontend challenge-token integration are separately implemented/tested.
- [ ] Password-change reauthentication/current-password enforcement remains unchanged until the UI/server flow supports the required nonce/current-password data.

Current Supabase documentation checked during this review confirms the 8+ recommendation, strongest required-character option, hosted email-confirmation setting, and Pro+ requirement for leaked-password protection.

## Repository verification evidence

Final repository candidate: `b0a2f6ce405dd66a7c1841dbc94d2524015fc49f`.

GitHub Actions run `35123516886` was re-run after the repository became public and received a GitHub-hosted runner. The complete workflow executed successfully on 2026-09-16.

Verified gates:

- exact KingHost Node runtime `22.1.0`: PASS;
- `pnpm install --frozen-lockfile`: PASS;
- `pnpm lint`: PASS with zero warnings;
- `pnpm typecheck`: PASS;
- `pnpm build:kinghost`: PASS;
- private-order route contract: PASS;
- KingHost startup adapter smoke: PASS;
- explicit critical commerce/security subset: PASS, 58/58;
- full test suite: PASS, 880/880.

The production build also confirmed request-time rendering for the application routes required by nonce CSP, including dynamic `/robots.txt` and `/sitemap.xml`, and successfully prepared the KingHost standalone package.

Earlier runs on the same branch had failed before runner allocation because the account had exhausted private-repository Actions minutes. Those infrastructure failures had `runner_id: 0` and `steps: []`; they are superseded for repository verification by the complete green run above.

Repository gate status: **COMPLETE**.

## Isolated KingHost sandbox acceptance

Status: **NOT PERFORMED — ENVIRONMENT DETAILS/CREDENTIALS NOT AVAILABLE IN REPOSITORY**.

The sandbox runbook still deliberately uses placeholders:

- `https://<sandbox-host>`;
- `<sandbox-web-root>`;
- separate sandbox Supabase credentials;
- separate Mercado Pago sandbox credentials;
- separate Melhor Envio sandbox credentials.

No sandbox hostname, webroot or credentials were invented or copied from production. Therefore no deploy/smoke is claimed.

Before merge readiness, the isolated KingHost application must verify:

- [ ] deployed SHA is the final reviewed candidate;
- [ ] `APP_ENVIRONMENT=sandbox`;
- [ ] separate sandbox Supabase/provider credentials;
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
- [ ] actual KingHost proxy chain is measured before setting a non-zero trusted-hop value.

## Final decision gate

Do **not** open/merge the hardening PR as accepted until all three items below are true:

1. [x] current final SHA receives a real green CI execution;
2. [ ] Supabase Auth dashboard checklist is owner-verified;
3. [ ] isolated KingHost sandbox smoke is completed and this document is updated with the sandbox evidence.

Production remains unchanged until that explicit owner decision.
