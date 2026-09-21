# Phase 9 — Audit Matrix

**Date:** 2026-09-15  
**Branch:** `feat/phase-9-hardening-final-rollout`  
**Design:** `docs/superpowers/specs/2026-09-15-phase-9-hardening-final-rollout-design.md`  
**Plan:** `docs/superpowers/plans/2026-09-15-phase-9-hardening-final-rollout.md`

This matrix is the operational audit ledger for Phase 9. `PASS` means repository/hosted evidence is sufficient for that technical boundary. `RESOLVED` means a demonstrated defect was corrected and revalidated. `KEEP_INTENTIONAL` / `KEEP_UNPROVEN` mean advisor findings were reviewed and intentionally retained. `PLATFORM_LIMITATION / OWNER DASHBOARD CHECK` means the connected tooling cannot safely complete or verify the hosted setting. `OWNER SMOKE PENDING` means the remaining proof requires an authenticated/manual observation by the owner.

| Domain | Disposition | Evidence / next proof |
| --- | --- | --- |
| Admin auth + AAL2 + app session | PASS | Owner UUID/AAL2 + active app session remains the authorization boundary; admin auth core/UI suites remain green. |
| Customer ownership/isolation | PASS | Identity comes from trusted Supabase Auth, not a browser-selected customer UUID; private-order/account ownership suites remain green. |
| Checkout authority | PASS | Checkout keeps rate limiting, exact-origin validation and verified authenticated customer identity; server remains price/freight/order authority. |
| Origin / CSRF mutation boundaries | PASS | Phase 9 route inventory plus focused suites cover account/admin product/image/settings/shipment mutation boundaries. |
| Cache / no-store | OWNER SMOKE PENDING | Automated contracts cover protected no-store/force-dynamic behavior; final authenticated browser/network observation remains in `FINAL_MANUAL_SMOKE.md`. |
| Rate limits / abuse resistance | PASS | HMAC-backed scopes remain wired for checkout, public shipping, account auth/recovery/profile, Melhor Envio OAuth and admin shipping mutations/spend; signed/idempotent webhooks remain exceptions by design. |
| Secret / browser boundary | PASS | Service keys/provider credentials/TOTP/admin secrets remain server-only; Phase 9 inventory adds explicit regression coverage. |
| Guest order/payment retirement | PASS | Browser guest-order/payment/claim surfaces remain absent; any legacy service-only RPC does not restore browser authority. |
| Melhor Envio explicit spending / ambiguity | PASS | Purchase gate remains fail-closed; ambiguous provider outcomes enter attention/reconciliation instead of blind retry. |
| Transactional notifications | PASS | Durable outbox/worker/provider idempotency remains separate from payment/fulfillment/shipping truth. |
| Store Settings authority | PASS | Protected same-origin mutation, bounded body, optimistic `expectedUpdatedAt`, sanitized public projection and stale-write rejection remain intact. |
| Phase 8 dashboard read-only contract | PASS | Server-only aggregation, explicit unavailable state, no synthetic zeros and read-only Attention Center remain guarded. |
| Supabase RLS / grants / privileged functions | PASS | Post-migration hosted scan confirmed fixed search paths and expected execute grants; administrative RPCs are service-role-only and the two authenticated customer RPCs remain intentionally owner-scoped through `auth.uid()`. |
| Supabase Auth leaked-password protection | PLATFORM_LIMITATION / OWNER DASHBOARD CHECK | Fresh advisor confirms disabled. Supabase docs state Pro+ availability; connected tooling does not expose hosted Auth config mutation or project-tier verification, so Phase 9 did not enable/claim it blindly. |
| `customer_profiles` RLS initplan | RESOLVED | Hosted migration `20260915145834 phase9_customer_profiles_rls_performance` preserved ownership semantics using `(select auth.uid()) = id`; all three `auth_rls_initplan` warnings disappeared. |
| Unused index review | KEEP_INTENTIONAL / KEEP_UNPROVEN | Six INFO findings reviewed against DDL, FK/constraints, query shape, overlap and hosted stats. No index met the safe-removal evidence gate; no drop migration was created. |
| Concurrency / idempotency | PASS | Payment dedupe, preference lease, fulfillment row locks, product/settings optimistic revisions, shipment operation IDs/versioning, notification idempotency, recovery lease, attention uniqueness and dashboard single-`as_of` consistency are consolidated in `CONCURRENCY_MATRIX.md`. |
| Historical Phase 4 product-admin smoke | OWNER SMOKE PENDING | Automated lifecycle/image/conflict coverage exists; broad browser smoke remains explicitly deferred into the final checklist. |
| Phase 8 authenticated dashboard smoke | OWNER SMOKE PENDING | Phase 8 hosted validation and Vercel candidate deployment exist; authenticated `/admin` owner observation remains open. |
| Final Phase 9 Production smoke | OWNER SMOKE PENDING | Run only after exact final candidate deployment/restart; authenticated business/admin acceptance remains owner-performed. |

## Phase 9 demonstrated correction

The only concrete hosted DB defect identified at Phase 9 start was the `customer_profiles` RLS initplan performance issue. It was corrected by the additive migration `202609150002_phase9_customer_profiles_rls_performance.sql`, hosted as `20260915145834 phase9_customer_profiles_rls_performance`.

Post-migration evidence confirms the three warnings are gone, RLS remains enabled, authenticated ownership semantics are unchanged, and no browser authority was broadened.

## Advisor baseline after correction

- Performance: only six pre-existing `unused_index` INFO findings remain; all were retained after evidence review.
- Security: 16 backend-private `rls_enabled_no_policy` INFO findings remain intentional; two authenticated customer `SECURITY DEFINER` WARN findings remain intentional owner-scoped RPCs; leaked-password protection remains disabled.
- No new Phase 9-specific advisor regression was introduced.

Detailed hosted evidence: `docs/superpowers/phase-9/HOSTED_VALIDATION.md`.

## Acceptance debt intentionally preserved

The project must not be described as fully Production-accepted until the owner performs the inherited Phase 4 product-admin smoke, the Phase 8 authenticated dashboard smoke and the final Phase 9 Production smoke. Automated green status, hosted advisor cleanup and public HTTP health are necessary evidence but do not substitute for those manual gates.
