# ProxyBembem — KingHost Migration Design

**Date:** 2026-09-02
**Branch:** `feat/admin-dashboard-expansion`

## Goal

Move the ProxyBembem application runtime from previous hosting provider to KingHost Node.js III while keeping the existing Supabase project as the database/authentication backend and preserving the current Phase 3 checkpoint.

The previous hosting provider project must remain available until the KingHost runtime is deployed, validated, and owner-accepted. Deleting the previous hosting provider project is the final step only.

## Current checkpoint to preserve

- Phase 3 Tasks 1–13 are complete/applied/database-validated.
- Task 14 Preview acceptance is in progress.
- Current GREEN runtime candidate: `14a6f337892876e47680a3c13fa671602b6e584e`.
- Current docs-only branch HEAD before this migration design: `02f3a2ed09478f81edf335eb06ef9bd321120b4a`.
- Supabase migration `20260902220354_customer_accounts_orders` is already applied and must not be reapplied.
- Do not start Phase 4 before Phase 3 completion.

## Target architecture

### KingHost

- Product: Hospedagem Node.js III.
- Runtime: Node.js 22.1.0.
- Application name: `proxybembem`.
- Web path: `/`.
- KingHost direct/internal application port is managed by KingHost; the application must bind to the environment-provided port rather than a hard-coded port.
- GitHub repository: `Bembemm/proxybembem`.
- Deployment branch during migration: `feat/admin-dashboard-expansion`.
- Publication directory: `/apps_nodejs/proxybembem/`.
- GitHub auto-clone/webhook integration is enabled for that branch/directory.

### Supabase

Keep the existing hosted Supabase `ProxyBembem` project unchanged as the backend for:

- PostgreSQL data;
- Supabase Auth;
- RLS;
- RPCs;
- customer accounts/orders;
- server-side privileged operations through the existing secret/service credentials.

Do not migrate the database to KingHost as part of this infrastructure change.

### External providers

Mercado Pago and Melhor Envio remain external providers. Their production callback/origin URLs must point to the final HTTPS KingHost-backed `proxybembem.com.br` origin after validation.

## Application changes

Make the runtime provider-neutral rather than previous hosting provider-dependent:

1. Add a KingHost-compatible production entrypoint that starts the Next.js runtime on the port supplied by KingHost.
2. Prefer a Next.js production/standalone deployment layout suitable for the 512 MB Node.js III runtime rather than compiling on every request.
3. Remove operational dependence on `HOSTING_ENV` where production behavior can safely derive from `NODE_ENV=production` or an explicit provider-neutral environment variable.
4. Preserve all existing security behavior: HTTPS-only production origin checks, checkout origin validation, HSTS in production, Supabase browser CSP origin, Mercado Pago environment safety, Melhor Envio environment safety, admin auth/session boundaries, customer auth isolation, guest claim rules, and DTO redaction.
5. Remove or disable legacy analytics integration only if it causes runtime/provider coupling; this must not affect checkout, auth, admin, or customer flows.
6. Do not commit any production secrets. KingHost environment variables must be configured outside Git.

## Environment configuration

KingHost must receive the same required production environment values currently used by the application, including the Supabase URLs/keys, site URL, Mercado Pago, Melhor Envio, admin identity, rate-limit/cron/quote secrets and any other variables required by the current runtime.

`NEXT_PUBLIC_SITE_URL` must be the canonical HTTPS production origin.

Secrets must never be copied into repository files, chat-visible documentation, or client-side variables unless they are explicitly designed as public variables.

## Deployment sequence

1. Prepare provider-neutral/KingHost runtime support on the existing feature branch.
2. Run automated test, typecheck and production build on the exact candidate.
3. Let KingHost pull the candidate through the configured GitHub integration.
4. Configure required KingHost environment variables and application startup script.
5. Start the Node application and validate it through the KingHost direct/runtime route first where possible.
6. Validate DNS/SSL after `proxybembem.com.br` delegates to KingHost.
7. Run smoke tests on `/`, `/produtos`, checkout validation, public order tracking, unauthenticated customer redirects, admin boundaries and provider callback/origin behavior.
8. Run the pending Phase 3 Task 14 account acceptance on KingHost: normal verified test customer login, account pages, own order detail, second-account isolation and deliberate safe guest-order claim.
9. Review KingHost/application error logs after the acceptance checks.
10. Only after owner acceptance, treat KingHost as the replacement application runtime.
11. Delete/remove the previous hosting provider project only after explicit owner approval at the final cutover step.
12. Resume Phase 3 Task 15/completion gate from the preserved checkpoint; do not restart Phase 3 from scratch.

## Rollback

Until final owner acceptance, previous hosting provider remains available as the fallback runtime. If the KingHost deployment has a blocking defect, stop the cutover and fix KingHost/runtime compatibility without changing the already-validated Supabase Phase 3 data model.

Do not delete the previous hosting provider project, feature branch, Supabase project, production data, or provider credentials as part of rollback.

## Acceptance criteria

The migration is accepted only when:

- exact KingHost runtime candidate passes tests/typecheck/build;
- `proxybembem.com.br` serves the KingHost deployment over valid HTTPS;
- checkout performs validation before provider preference creation;
- Mercado Pago/ Melhor Envio production safeguards remain intact;
- Supabase Auth/session behavior works from the KingHost origin;
- unauthenticated customer routes redirect without private reads/data exposure;
- customer own-order isolation and guest-claim rules pass the existing Phase 3 acceptance expectations;
- admin auth/session behavior remains intact;
- no secrets are exposed in Git/client output;
- post-smoke runtime logs contain no migration-introduced fatal/security errors;
- owner explicitly approves final previous hosting provider removal.

## Non-goals

- No Supabase-to-KingHost database migration.
- No Phase 4 feature work.
- No checkout/payment behavior redesign.
- No unrelated refactoring.
- No Production merge solely to accomplish the hosting migration.
