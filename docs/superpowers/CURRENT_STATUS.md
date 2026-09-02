# ProxyBembem — Current Status

**Updated:** 2026-09-02

Canonical continuation checkpoint. Read this file, `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Branch: `feat/admin-dashboard-expansion`
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`
- Design: `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`
- Active plan: `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`
- State: **PHASE 1 APPLIED/VERIFIED; PHASE 2 TASKS 1–4 TDD COMPLETE THROUGH STRICT REPOSITORIES; TASK 5 NEXT**
- Merge/new Production application deployment: **NOT APPROVED**

## Phase 1 verified baseline

Phase 1 database foundation is applied to the existing Supabase project `ProxyBembem` (`kicgoocozxzkuoqajqif`) after explicit owner authorization.

Validation evidence included:

- 25 existing orders checked with correct fulfillment backfill;
- no fabricated historical events;
- event, attention and audit tables with RLS/browser-role isolation;
- append-only service-role privileges for audit/events;
- payment approval/replay/refund/chargeback/manual-review transaction tests;
- zero persistent validation fixtures;
- Production `/admin` remained healthy after the additive migration.

Owner workflow decision remains: evolve the current Supabase project as schema is needed. Do not require a paid Supabase development branch. Meaningful DDL still requires explicit owner approval before application.

## Vercel Preview — restored

The earlier `/admin` Preview 500 was investigated and is resolved.

Evidence:

- old `feat/checkout-mercadopago` Preview proved `/admin` had worked with Supabase env;
- env configuration was aligned for the current Preview branch;
- `vercel.json` currently has an `ignoreCommand` that intentionally cancels `feat/admin-dashboard-expansion` deployments unless the commit message contains `[preview]`;
- commit `2bbd3d3b79ed1afdb8a786d0668bfc7db383be66` (`[preview] chore: retest preview environment`) forced the validation deployment;
- deployment `dpl_6C87JJ66mKGqkt93yTLToDWzEAfa` reached READY;
- direct Preview `/admin`: 200 and protected login page rendered;
- fixed branch alias `/admin`: 200;
- CSP includes the configured Supabase origin.

Do not misdiagnose future canceled deployments as build/env failures before checking the intentional `[preview]` ignore rule.

## Phase 2 migration — code only, not applied

Migration file:

`supabase/migrations/202609020002_admin_order_fulfillment_operations.sql`

Implementation commit:

`334d7d1b0bf9fb06e33da08dca16f03ca82384b5`

Fresh CI for that commit passed:

- `pnpm test`: PASS
- `pnpm typecheck`: PASS
- `pnpm build`: PASS

Migration defines:

- backend-only `admin_list_orders(...) -> jsonb` with bounded static filtering/pagination and São Paulo date boundaries;
- backend-only locked `admin_transition_order_fulfillment(...) -> jsonb`;
- atomic fulfillment event + append-only admin audit + paid-cancellation attention;
- narrow reversal observer resolving only `canceled_paid_order` after actual `refunded`/`charged_back` payment state.

**The Phase 2 migration has NOT been applied to Supabase.** Keep it unapplied until the full Phase 2 code candidate is reviewed/verified and the owner approves the exact DDL application.

## Phase 2 Task 3 — admin read repository

RED commit:

`d619ead792b56376327bdbed6f2aaf1933457878`

RED evidence: 256 passing tests and one expected `ERR_MODULE_NOT_FOUND` for `lib/server/admin-orders.ts`.

GREEN commit:

`f8ded33f97fb89ef4343caa77ee3457efbf3b79a`

CI run `33634645304`, job `100262324239`:

- `pnpm test`: PASS
- `pnpm typecheck`: PASS
- `pnpm build`: PASS

Implemented `lib/server/admin-orders.ts` with server-only service-role reads, strict filters/response parsing, approved list/detail DTOs, bounded pagination/timeouts, sanitized errors and explicit exclusion of public token, checkout fingerprint/URL/attempt and raw shipping snapshot.

## Phase 2 Task 4 — strict fulfillment repository

RED commit:

`8caf02f9c83611b31c5fe18a03a9764fb8754df6`

RED evidence: 263 passing tests and one expected `ERR_MODULE_NOT_FOUND` for `lib/server/admin-order-operations.ts`.

GREEN commit:

`f27143474c531cf8da49f49c28be42e73a7d8921`

CI run `33634997803`, job `100263535734`:

- `pnpm test`: PASS
- `pnpm typecheck`: PASS
- `pnpm build`: PASS

Implemented `lib/server/admin-order-operations.ts`:

- exact service-role RPC call only;
- canonical order/admin UUID validation before fetch;
- only admin targets `in_production`, `ready_to_ship`, `shipped`, `completed`, `canceled`;
- strict documented outcome parser;
- no payment mutation fields or provider calls;
- sanitized network/storage failures.

## Phase 2 target flow

```text
awaiting_payment -> canceled
awaiting_production -> in_production | canceled
in_production -> ready_to_ship | canceled
ready_to_ship -> shipped | canceled
shipped -> completed
completed -> none
canceled -> none
```

Starting production requires approved payment. Mercado Pago remains authoritative for financial state.

## Safety gates

- Phase 2 DDL is not applied to Supabase yet.
- Do not merge the feature branch without explicit owner approval.
- Do not create/promote a new Production application deployment without explicit owner approval.
- Intentional Preview validation commits need `[preview]` while the current Vercel ignore rule remains.

## Resume point

**Last verified runtime commit:** `f27143474c531cf8da49f49c28be42e73a7d8921` with full CI green.

**NEXT EXACT ACTION:** execute Phase 2 Task 5 from the active plan. Start by creating only `tests/admin-order-actions.test.ts` and capture RED for the missing protected action-handler module. Then implement `lib/server/admin-order-actions.ts` and the narrow POST route modules. Keep browser target status fixed by route/server code, re-authorize AAL2 + active admin session on every write, enforce same-origin, and keep Phase 2 DDL unapplied.