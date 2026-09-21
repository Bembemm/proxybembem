# Phase 9 — Hardening + Final Rollout Design

**Date:** 2026-09-15  
**Branch:** `feat/phase-9-hardening-final-rollout`  
**Base:** Phase 8 candidate `773504f0e68220c1bda0ec706c4e62f8d542e433`  
**Project:** ProxyBembem

## 1. Goal

Phase 9 is the final hardening and close-out phase of the ProxyBembem project. Its job is to audit the complete system as it exists after Phases 0–8, correct objective problems that can be fixed safely, preserve the accepted business model and security boundaries, and produce one final rollout candidate with fresh verification evidence.

This phase is **audit + targeted correction**, not feature expansion and not broad refactoring for its own sake.

## 2. Starting state

Phase 9 begins from the Phase 8 branch state at `773504f0e68220c1bda0ec706c4e62f8d542e433`.

At this point:

- Phases 0–7 are functionally complete at their accepted level;
- Phase 8 implementation and hosted Supabase validation are complete;
- the Phase 8 runtime candidate has been deployed to Vercel;
- the authenticated `/admin` production smoke for Phase 8 remains explicitly open because the owner cannot complete it now;
- Phase 8 therefore must not be rewritten as Production-accepted until that smoke is actually performed;
- Phase 9 may proceed because the owner explicitly authorized it despite that open acceptance gate.

The Phase 8 open smoke remains an inherited final-project acceptance dependency.

## 3. Non-goals

Phase 9 does not:

- invent new customer-facing or admin features;
- redesign checkout, payment, fulfillment, shipping, notifications or account flows without a concrete hardening need;
- restore guest checkout, guest payment, `/pedido/[token]` or guest claim;
- replace the modular-monolith architecture;
- migrate hosting/provider stacks;
- rewrite already-applied migrations;
- remove indexes or security controls merely because an advisor labels them unused or informational;
- merge, squash, rebase, delete branches or force-move refs without explicit owner approval;
- claim Production acceptance without fresh evidence.

## 4. Hard invariants

The following must survive Phase 9 unchanged unless a correction is required to enforce them more strongly:

1. Browser never owns authoritative price, freight, total, payment state, customer ownership or provider identity.
2. Mercado Pago remains financial authority.
3. Supabase `public.products` remains the runtime catalog authority.
4. Customer order reads remain authenticated and owner-scoped.
5. Admin access remains owner UUID + password + TOTP/AAL2 + active server-side admin session.
6. Protected responses remain non-cacheable.
7. Same-origin protections remain required for sensitive state-changing admin/customer routes.
8. Melhor Envio spending remains explicit and fail-closed; `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` is the normal safe state outside deliberate purchase windows.
9. Ambiguous external-provider mutations must be reconciled before retry.
10. Notification failure never mutates payment, fulfillment or shipping truth.
11. Store Settings remains allowlisted and secret-free.
12. Phase 8 dashboard and Attention Center remain read-only.
13. Already-applied hosted migrations are never edited/reapplied.
14. Secrets must never be exposed to browser bundles, logs, public docs or error responses.

## 5. Audit-and-correct policy

Each finding is classified before action:

### 5.1 Fix in Phase 9

Fix when the issue is objective, bounded and preserves intended business behavior, including:

- authorization/isolation weakness;
- missing or over-broad grants;
- unsafe `SECURITY DEFINER` configuration;
- missing fixed `search_path` where required;
- same-origin or CSRF regression;
- missing `no-store` on protected data;
- insufficient validation or unsafe parser behavior;
- rate-limit gap on abuse-sensitive endpoints;
- stale/unsafe secret handling;
- concurrency/idempotency weakness;
- confirmed RLS performance issue whose correction preserves semantics;
- dead/redundant DB index when repository queries, constraints, FKs and hosted evidence demonstrate safe removal;
- regression discovered by tests or hosted reconciliation.

### 5.2 Keep and document

Keep when a warning is intentional, informational or not proven harmful, including:

- backend-only tables with RLS enabled and no browser policies when browser CRUD is revoked;
- unused-index findings without enough evidence to prove safe removal;
- performance warnings whose correction would alter security semantics or create speculative complexity;
- provider/platform warnings that cannot be changed safely or are plan-limited.

### 5.3 Stop for owner approval

Stop before implementing a finding whose correction would materially change:

- checkout behavior;
- payment/reversal semantics;
- order ownership model;
- shipping purchase/cancellation behavior;
- customer authentication UX;
- admin MFA/session requirements;
- product lifecycle/business rules;
- public pricing or production promises;
- any destructive data migration.

## 6. Audit domains

### 6.1 Authentication and authorization

Audit:

- admin owner UUID boundary;
- password + TOTP/AAL2 enforcement;
- active admin-session checks and touch/expiry behavior;
- customer verified identity before payment start;
- account/password-recovery grants;
- separation between customer auth and admin authorization;
- route-level authorization on server actions/API endpoints;
- accidental auth bypasses caused by middleware/layout assumptions.

Required outcome: no protected capability is reachable through URL knowledge, browser-supplied identity, lower AAL, stale session or alternate route.

### 6.2 Ownership and data isolation

Audit all customer-facing order/shipment/profile reads and mutations for:

- ownership derived from trusted auth identity;
- no user-supplied UUID authority;
- no cross-account access;
- sanitized projections only;
- private provider identifiers and internal metadata remaining server-only.

Audit admin paths separately so owner-level access never leaks into customer flows.

### 6.3 Origin, CSRF and mutation boundaries

Inventory sensitive POST/PATCH/DELETE/server actions and verify:

- same-origin enforcement where cookie/session authority is used;
- safe method/content expectations;
- fail-closed behavior on malformed origins/headers;
- GET/route rendering has no hidden mutation side effects.

### 6.4 Cache and response privacy

Audit protected routes and private APIs for:

- `cache: "no-store"` server fetches;
- dynamic rendering where private freshness is required;
- response `Cache-Control`/equivalent behavior;
- no private data entering static/public caching paths.

The historical missing manual observation of authenticated `no-store` headers is explicitly included in the final smoke checklist.

### 6.5 Rate limiting and abuse resistance

Inventory abuse-sensitive endpoints, including auth-adjacent operations, checkout/payment-start, password recovery, admin auth/session operations, notification resend/worker controls and provider-facing webhooks.

For each endpoint, verify existing rate limits or justify why provider signature/idempotency/server-only invocation is the stronger control.

Add or tighten rate limits only where there is a concrete gap and without breaking legitimate provider retries.

### 6.6 Secrets and environment boundaries

Audit env readers, server modules, client imports, logging and docs for:

- Supabase service key;
- Mercado Pago credentials;
- Melhor Envio OAuth/client credentials/tokens;
- Resend/Svix secrets;
- cron/worker/admin secrets;
- TOTP secrets;
- Vercel runtime configuration.

No secret is moved into Store Settings or database rows merely to simplify code.

### 6.7 Supabase schema, RLS, grants and functions

Review hosted state and migrations for:

- RLS enablement and intentional policy absence;
- browser-role CRUD exposure;
- service-role-only RPC grants;
- `SECURITY DEFINER` functions;
- fixed empty `search_path` where applicable;
- dynamic SQL and search-path hazards;
- overly broad function/table/storage permissions;
- advisors after any DDL correction.

Existing `authenticated_security_definer_function_executable` findings for customer RPCs are reviewed semantically, not mechanically removed if the authenticated execution is required for the owner-scoped customer contract.

### 6.8 Supabase Auth hardening

Evaluate leaked-password protection.

Rule approved by owner:

- enable it in Phase 9 when the hosted account/project supports it and doing so does not create an unacceptable compatibility risk;
- if platform/plan limitations or demonstrated user-impact risk prevent safe activation, record the limitation and do not force it.

No claim that it is enabled is allowed without hosted verification.

### 6.9 RLS performance and query performance

Investigate the known `customer_profiles` `auth_rls_initplan` findings and correct them when the rewritten policy preserves identical ownership semantics.

Re-run advisors and relevant query checks after changes.

Unused indexes are not automatically deleted from advisor output alone. Before removal, verify:

- index definition and uniqueness;
- backing constraint/FK implications;
- repository and RPC query predicates/orderings;
- likely operational paths and provider reconciliation queries;
- whether another index fully subsumes it;
- hosted usage/size evidence when available.

Only clearly redundant indexes are removed, using an additive migration; uncertain indexes remain documented.

### 6.10 Concurrency and idempotency matrix

Re-audit critical state transitions:

- Mercado Pago webhook/payment state application;
- payment-preference creation/lease;
- fulfillment transitions;
- product/settings optimistic concurrency;
- shipment prepare/purchase/generate/post/cancel/reconciliation;
- notification outbox/worker/webhook/manual resend;
- password recovery grant consumption;
- attention-flag lifecycle;
- dashboard read snapshot consistency.

For each flow, establish authority, dedupe/idempotency key, retry behavior, stale-write behavior and ambiguous-provider behavior.

Correct confirmed holes; do not add abstraction solely for symmetry.

### 6.11 Historical Phase 4 smoke debt

The broad manual product-admin smoke that was historically deferred is brought into the final project acceptance checklist:

- create/edit product;
- draft/published/archived behavior;
- protected image upload;
- stale edit/conflict handling;
- public catalog/cache propagation.

Automated coverage is strengthened first where practical so the final manual smoke is short and deterministic.

### 6.12 Phase 8 inherited smoke debt

The authenticated Production `/admin` smoke remains explicit and open until the owner can perform it.

Required observations include:

- dashboard loads without synthetic-zero fallback;
- period metrics, operations, risk, attention and products render;
- attention links/filter work;
- no raw sensitive attention metadata is exposed;
- Melhor Envio utility remains accessible;
- authenticated private response caching is appropriate.

Phase 9 may complete implementation before this check, but final project Production acceptance cannot silently erase this pending evidence.

## 7. Testing strategy

Phase 9 uses evidence-driven testing.

### 7.1 Automated regression

The final candidate must pass, at minimum:

- frozen dependency install under Node.js 22.x;
- TypeScript typecheck;
- `build`;
- private-order route contract;
- Vercel runtime smoke;
- full test suite;
- new targeted tests for every code-level correction;
- security/contract tests for any grant/origin/cache/rate-limit change.

For bug/security fixes, tests must demonstrate the regression when feasible before the correction is accepted.

### 7.2 Hosted Supabase verification

Any new DB migration must be:

- additive;
- applied once;
- reconciled against expected schema/behavior;
- followed by grants/function/policy checks;
- followed by security/performance advisor review.

No synthetic business data is left behind by validation.

### 7.3 Production smoke

Final rollout uses one exact CI-green SHA.

Vercel process:

- exact candidate checkout;
- Node.js 22.x;
- frozen install;
- production `build`;
- restart only through Vercel dashboard;
- public HTTP smoke;
- authenticated admin/customer/private-route smoke;
- explicit verification of any corrected high-risk boundary.

## 8. Rollout and rollback discipline

Phase 9 remains on `feat/phase-9-hardening-final-rollout` until owner explicitly approves integration.

Production rollout uses a detached exact SHA to avoid branch drift.

No PM2 CLI restart is used.

If a correction produces a Production regression:

- stop rollout;
- preserve evidence;
- return runtime to the last known-good exact SHA when necessary;
- do not rewrite Git history or hosted migration history;
- use additive follow-up migration for DB fixes.

## 9. Documentation and evidence

Phase 9 must reconcile the canonical status documents so they reflect reality rather than historical checkpoints.

Final documentation records separately:

- implementation-complete status;
- hosted-validation status;
- exact final CI run and SHA;
- exact Production runtime SHA;
- owner-performed manual smoke evidence;
- any intentionally deferred/manual-only item;
- accepted advisor findings and their rationale;
- Phase 8 inherited smoke result when eventually performed.

No owner-reported evidence is upgraded into independently observed evidence.

## 10. Completion criteria

Phase 9 implementation is complete only when:

1. all audit domains have a recorded disposition;
2. objective safe findings have been corrected or explicitly justified as retained;
3. code-level corrections have targeted regression coverage;
4. final automated suite and Vercel build are green on one exact SHA;
5. all Phase 9 migrations, if any, are applied once and hosted checks are reconciled;
6. security/performance advisors have been re-reviewed after final DDL;
7. exact rollout candidate is documented;
8. no unknown Critical/High project-specific security finding remains open.

The **project is finally Production-accepted** only after the remaining manual acceptance gates that require owner interaction are performed, including the inherited Phase 8 authenticated `/admin` smoke and the final Phase 9 smoke. If the owner cannot perform them yet, the repository must say `implementation complete / rollout evidence pending`, not `fully accepted`.

## 11. Integration rule

Completion of Phase 9 does not automatically merge anything into `main`.

After final evidence exists, the owner decides whether and how to integrate the Phase 8/9 lineage into `main`. No branch deletion, force update, rebase or squash occurs without explicit approval.
