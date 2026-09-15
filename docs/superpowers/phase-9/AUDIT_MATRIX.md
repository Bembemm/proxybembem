# Phase 9 — Audit Matrix

**Date:** 2026-09-15  
**Branch:** `feat/phase-9-hardening-final-rollout`  
**Design:** `docs/superpowers/specs/2026-09-15-phase-9-hardening-final-rollout-design.md`  
**Plan:** `docs/superpowers/plans/2026-09-15-phase-9-hardening-final-rollout.md`

This matrix is the operational audit ledger for Phase 9. A `PASS` means the reviewed repository boundary has current evidence. `HOSTED CHECK` means repository evidence is insufficient and hosted Supabase/Auth state must be checked. `FIX REQUIRED` is reserved for a demonstrated issue, not a speculative improvement. `OWNER SMOKE PENDING` means the remaining proof requires an authenticated/manual observation by the owner.

| Domain | Disposition | Evidence / next proof |
| --- | --- | --- |
| Admin auth + AAL2 + app session | PASS | `lib/server/admin-auth.ts`; `tests/admin-auth-core.test.ts`; `tests/admin-auth.test.ts`; `tests/admin-auth-ui.test.ts`. Owner UUID/AAL2 plus active app session remains the authorization boundary. |
| Customer ownership/isolation | PASS | `lib/server/customer-auth.ts`, `lib/server/customer-profiles.ts`, private customer order/shipment repositories; `tests/customer-profile.test.ts`, `tests/private-order-only.test.ts`, account/order ownership suites. Identity comes from trusted Supabase Auth, not browser-selected customer UUID. |
| Checkout authority | PASS | `app/api/checkout/route.ts` keeps checkout rate limiting, exact origin validation and verified authenticated customer identity before payment start; server checkout flow remains price/freight/order authority. |
| Origin / CSRF mutation boundaries | PASS | Account mutation tests require exact same-origin; admin products, image upload and Store Settings use the shared allowed-origin boundary; shipment mutation suites cover protected admin actions. Task 3 performs the final full-route inventory and may reclassify a concrete miss. |
| Cache / no-store | OWNER SMOKE PENDING | Automated contracts cover `no-store` on checkout/admin/private mutation/read paths and `/admin` is force-dynamic. The historical authenticated Production header observation is intentionally carried into `FINAL_MANUAL_SMOKE.md`. |
| Rate limits / abuse resistance | PASS | `lib/server/rate-limit.ts` has separate HMAC-backed scopes for checkout, public shipping, account auth/recovery/profile, Melhor Envio OAuth and admin shipping mutations/spend; existing route suites verify wiring. Task 3 will inventory all sensitive endpoints and document signed/idempotent webhook exceptions. |
| Secret / browser boundary | PASS | Admin/client auth tests and repository review keep Supabase service keys, provider credentials, TOTP/admin secrets and Resend/Mercado Pago/Melhor Envio credentials server-only. Phase 9 inventory adds an explicit regression guard. |
| Guest order/payment retirement | PASS | `tests/private-order-only.test.ts` plus Phase 9 inventory require `/pedido/[token]`, guest claim and browser-authoritative ownership surfaces to remain absent. |
| Melhor Envio explicit spending / ambiguity | PASS | `lib/server/shipment-lifecycle-service.ts` returns `purchase_disabled` before provider purchase when the spending gate is off; ambiguous purchase persistence transitions to `purchase_outcome_unknown` attention instead of blind retry. `tests/shipment-no-auto-spend.test.ts` guards webhook/ready-to-ship paths. |
| Transactional notifications | PASS | Durable outbox/worker/provider idempotency behavior has existing Phase 6 regression coverage including `tests/notification-worker.test.ts`; e-mail outcome remains separate from payment/fulfillment/shipping truth. Task 5 re-records concurrency evidence. |
| Store Settings authority | PASS | Protected same-origin server mutation, bounded body, optimistic `expectedUpdatedAt`, no-store responses and sanitized public projection are existing Phase 7 contracts. Task 5 re-records stale-write behavior. |
| Phase 8 dashboard read-only contract | PASS | `app/admin/page.tsx`, server repository and `tests/admin-dashboard-ui.test.ts` preserve server-only aggregation, explicit unavailable state, no synthetic zeros and read-only attention presentation. Manual Production acceptance remains separate below. |
| Supabase RLS / grants / privileged functions | HOSTED CHECK | Phase 8 hosted review found no new Phase 8 exposure; Phase 9 must re-audit RLS, execute grants, `SECURITY DEFINER` and fixed `search_path` after any new DDL. Repository test + hosted advisor reconciliation are Task 4/7 gates. |
| Supabase Auth leaked-password protection | HOSTED CHECK | Existing advisor reports protection disabled. Phase 9 will inspect hosted Auth capability and enable only if supported and safe; otherwise record the platform/compatibility limitation without forcing it. |
| `customer_profiles` RLS initplan | FIX REQUIRED | Hosted performance advisor reports three `auth_rls_initplan` findings from direct `auth.uid()` policy evaluation. Task 2 replaces only those policies through an additive migration using `(select auth.uid())` with identical ownership semantics. |
| Unused index review | HOSTED CHECK | Six existing informational findings require DDL, FK/constraint, query-pattern and hosted usage review. No index is removed merely because the advisor calls it unused. |
| Concurrency / idempotency | PASS | Existing payment dedupe, preference lease, optimistic product/settings versions, shipment operation claims/reconciliation, notification idempotency, recovery lease and dashboard snapshot contracts exist. Task 5 consolidates them into one matrix and can reclassify any demonstrated hole. |
| Historical Phase 4 product-admin smoke | OWNER SMOKE PENDING | Automated product lifecycle/image/conflict coverage exists, but the historically deferred broad browser smoke is intentionally included in the final Phase 9 manual checklist. |
| Phase 8 authenticated dashboard smoke | OWNER SMOKE PENDING | Phase 8 implementation/hosted validation and KingHost candidate deployment exist, but owner could not complete authenticated `/admin` Production smoke. It remains open and must not be rewritten as accepted. |
| Final Phase 9 Production smoke | OWNER SMOKE PENDING | Only after one exact CI-green Phase 9 candidate is deployed. Public health can be observed independently; authenticated business/admin acceptance remains owner-performed. |

## Current demonstrated correction target

The only repository/hosted issue classified `FIX REQUIRED` at Phase 9 start is the `customer_profiles` RLS initplan performance finding. The planned correction is semantic-preserving: recreate the existing select/insert/update ownership policies with `(select auth.uid()) = id`, without changing grants, browser authority, table ownership or customer identity rules.

All other domains remain subject to the deeper Task 3–7 audit. A later finding may change a row from `PASS`/`HOSTED CHECK` to `FIX REQUIRED`, but only when evidence identifies a concrete defect.

## Acceptance debt intentionally preserved

The project must not be described as fully Production-accepted until the owner can perform the inherited Phase 4/8 checks and the final Phase 9 authenticated smoke. Automated green status, hosted advisor cleanup, and public HTTP health are necessary evidence but do not substitute for those manual gates.
