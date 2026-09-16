# Site Hardening Plan Reconciliation

Date: 2026-09-16
Branch: `hardening/site-security-nonce`

This document reconciles deliberate implementation changes discovered during execution/review of the four approved plans. It does not replace the original plans; it records why the final implementation differs where following the literal draft would make the result worse or less accurate.

## Plan 1 — CSP nonce / proxy separation

Status: repository implementation complete; external sandbox smoke remains part of final acceptance.

The execution index correction supersedes the initial Task 3 sketch: Supabase session refresh receives the small `{ nonce, contentSecurityPolicy }` security value and rebuilds `Headers` from the current request after cookie mutation rather than reusing a cloned pre-refresh `Headers` object.

This preserves refreshed auth cookies while keeping the same nonce/CSP for the request.

## Plan 2 — rate-limit proxy IP

Status: repository implementation complete; real KingHost proxy-hop topology still requires sandbox verification.

Final behavior keeps `RATE_LIMIT_TRUSTED_PROXY_HOPS=0` by default. No production hop count is guessed. A non-zero value is allowed only after observing/confirming the actual reverse-proxy chain.

## Plan 3 — lint / CI / SEO

Status: repository implementation complete, with the following deliberate reconciliations.

### CI order

The final workflow follows the approved order:

1. frozen install;
2. lint;
3. typecheck;
4. KingHost build;
5. route/startup smokes;
6. explicit critical commerce/security subset under Node 24;
7. full test suite.

### SEO social card

The draft plan mentioned `summary_large_image`. The repository has an existing 192x192 `/brand/pb` brand image but no reviewed 1200x630 social banner. The final metadata therefore uses Twitter `summary`, which matches the actual asset instead of advertising it as a large-image card.

A future dedicated social banner can switch this to `summary_large_image` in a separate visual/SEO change.

### Sitemap route set

The draft listed five public routes. During implementation, `/trocas-e-reembolsos` was confirmed to be a public, indexable policy page with its own canonical metadata. It is intentionally included in the final sitemap, giving six public canonical routes.

### Test organization

The draft proposed a combined `tests/tooling-seo.test.ts`. Execution split this into:

- `tests/lint-tooling.test.ts` for ESLint/CI contracts;
- `tests/seo-metadata.test.ts` for metadata/robots/sitemap contracts.

The split is organizational only; it preserves and expands the planned coverage.

### Environment-aware robots/sitemap

A final review found that Next metadata routes are otherwise cacheable/static. `app/robots.ts` and `app/sitemap.ts` are therefore explicitly `force-dynamic`, ensuring sandbox/production indexing behavior follows runtime `APP_ENVIRONMENT` rather than a reused build artifact.

## Plan 4 — Supabase Auth / final acceptance

Status: repository code and live Advisor review in progress/recorded; external Auth dashboard verification and isolated KingHost sandbox smoke remain required before merge readiness.

Repository password policy now enforces strong rules on signup/new-password mutations while leaving login credential parsing compatible with existing passwords. Client and server share the policy helper.

Live Advisor findings were reviewed rather than cosmetically silenced. Details are recorded in `SUPABASE_AUTH_SECURITY.md`.

The available Supabase connector cannot read or mutate the hosted Auth password/email-confirmation toggles, so the final acceptance must not represent those settings as verified until the owner confirms them in the Dashboard.

Likewise, the repository's KingHost sandbox runbook still contains placeholder host/webroot values and no sandbox credentials. A real sandbox smoke cannot be truthfully recorded from repository state alone.

## Merge-readiness rule

Repository CI being green is necessary but not sufficient. The branch is merge-ready only after:

- repository gates are green on the final candidate;
- Supabase Auth dashboard targets are owner-verified;
- the isolated KingHost sandbox candidate is deployed and manually smoked;
- CSP nonce behavior is observed in actual HTTP responses/browser console;
- the trusted proxy-hop setting is verified or intentionally left at fail-safe `0`;
- final acceptance evidence is updated without claiming unperformed checks.
