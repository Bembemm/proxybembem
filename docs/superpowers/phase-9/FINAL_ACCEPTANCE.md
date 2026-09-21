# Phase 9 — Final Acceptance

**Accepted:** 2026-09-15  
**Branch:** `feat/phase-9-hardening-final-rollout`  
**Production runtime SHA:** `cdb3f863336237ab49f9b91cca20f0d876aa75c7`

## Decision

Phase 9 — Hardening + Final Rollout is **PRODUCTION ACCEPTED**.

This acceptance combines independent evidence classes:

- repository/CI verification;
- hosted Supabase validation;
- exact Vercel rollout evidence;
- owner-reported authenticated/business Production smoke.

Manual acceptance was not inferred from CI or public HTTP health. On 2026-09-15 the owner received the complete remaining manual checklist covering Phase 4 historical product-admin debt, Phase 8 authenticated dashboard debt and final Phase 9 Production smoke, then explicitly reported **“tudo ok”**. That statement is recorded as owner-reported acceptance evidence.

## Runtime and rollout evidence

Production remains pinned to the exact accepted runtime candidate:

`cdb3f863336237ab49f9b91cca20f0d876aa75c7`

Evidence supplied from the production terminal on 2026-09-15:

- `git rev-parse HEAD` returned the exact SHA above;
- restart was completed through the Vercel dashboard, not PM2 CLI;
- public HTTPS health returned `HTTP/2 200`;
- expected security headers were present, including CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS;
- the only post-build working-tree change was Next.js-generated `next-env.d.ts` type references;
- after restoring that generated file, `git status -sb` returned only `## HEAD (no branch)` with no modified files.

The detached checkout is deliberate for the exact-SHA rollout.

## Repository / CI evidence

The final application runtime candidate passed the full CI contract at commit `cdb3f863336237ab49f9b91cca20f0d876aa75c7` in CI #1648 / run `34983376962`, including:

- exact Node.js 22.x setup;
- frozen pnpm install;
- TypeScript typecheck;
- Vercel production build;
- private-order route contract;
- Vercel runtime smoke;
- complete automated test suite.

Subsequent acceptance/test/documentation commits do not require a new Production runtime deploy unless they change application runtime code.

## Hosted Supabase evidence

Phase 8 hosted migration:

- `20260915092352 dashboard_metrics_attention_center`

Phase 9 hosted migration:

- repo: `supabase/migrations/202609150002_phase9_customer_profiles_rls_performance.sql`;
- hosted: `20260915145834 phase9_customer_profiles_rls_performance`.

Post-migration validation confirmed:

- `customer_profiles` RLS remains enabled and owner-scoped;
- the three policies use initplan-safe `(select auth.uid()) = id` semantics without ownership changes;
- browser grants remain bounded;
- the three former `auth_rls_initplan` warnings disappeared;
- privileged dashboard/customer RPC boundaries remain as designed;
- no new Phase 9 security finding was introduced.

## Owner-reported Production smoke

The owner reported the complete final checklist as passing on 2026-09-15.

Accepted manual domains include:

- Phase 4 product create/edit/publish/archive/reactivate/image flow;
- product optimistic-concurrency conflict in two tabs;
- catalog/cache propagation without restart;
- admin login with MFA/AAL2 + active app session;
- Phase 8 dashboard metrics, operational queues, financial risk, Attention Center and product ranking;
- `/admin/pedidos?attention=1` navigation and safe attention presentation;
- authenticated/private cache behavior;
- Store Settings read/write, propagation and stale-revision conflict;
- admin orders/production surfaces;
- Melhor Envio safe non-spending state;
- customer login and private account/order surfaces;
- cross-customer order isolation;
- authenticated checkout initiation with server-authoritative totals/shipping;
- notification administration/worker reachability without generating unnecessary customer spam;
- absence of raw secrets/provider payloads on protected browser surfaces;
- final public home/catalog health.

Detailed checklist: `docs/superpowers/phase-9/FINAL_MANUAL_SMOKE.md`.

## Residual non-blocking advisor/platform dispositions

These are documented, reviewed and are not treated as unknown acceptance blockers:

- leaked-password protection remains disabled because the connected tooling did not expose Auth configuration/tier proof; disposition remains `PLATFORM_LIMITATION / OWNER DASHBOARD CHECK` rather than pretending it was enabled;
- six `unused_index` INFO findings were individually reviewed and retained because safe redundancy was not proven;
- backend-only `rls_enabled_no_policy` INFO findings remain intentional where browser CRUD is revoked;
- authenticated `SECURITY DEFINER` warnings for the two customer order RPCs remain intentional and owner-scoped by `auth.uid()`.

No unresolved project-specific critical/high issue is known from the Phase 9 audit.

## Final phase status

- Phase 4 historical broad browser smoke debt: **CLOSED / OWNER ACCEPTED**.
- Phase 8 Dashboard Metrics + Attention Center: **PRODUCTION ACCEPTED**.
- Phase 9 Hardening + Final Rollout: **PRODUCTION ACCEPTED**.
- Project runtime/hosted/manual acceptance: **COMPLETE**, subject to the documented non-blocking platform/advisor dispositions above.

## Integration status

The Phase 9 branch is **not integrated into `main`**. No merge, squash, rebase, force move or branch deletion is authorized by this acceptance record. Integration into `main` requires separate explicit owner approval.
