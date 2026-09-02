# ProxyBembem — Current Status

**Updated:** 2026-09-02

Canonical continuation checkpoint. Read this file, `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Branch: `feat/admin-dashboard-expansion`
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`
- Design: `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`
- Active plan: `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`
- State: **PHASE 1 APPLIED/VERIFIED; PHASE 2 TASKS 1–7 TDD COMPLETE THROUGH ADMIN ORDERS LIST; TASK 8 NEXT**
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

The earlier `/admin` Preview 500 was investigated and resolved.

Evidence:

- env configuration was aligned for the current Preview branch;
- `vercel.json` has an `ignoreCommand` that intentionally cancels `feat/admin-dashboard-expansion` deployments unless the commit message contains `[preview]`;
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

Migration defines:

- backend-only `admin_list_orders(...) -> jsonb` with bounded static filtering/pagination and São Paulo date boundaries;
- backend-only locked `admin_transition_order_fulfillment(...) -> jsonb`;
- atomic fulfillment event + append-only admin audit + paid-cancellation attention;
- narrow reversal observer resolving only `canceled_paid_order` after actual `refunded`/`charged_back` payment state.

**The Phase 2 migration has NOT been applied to Supabase.** Keep it unapplied until the full Phase 2 code candidate is reviewed/verified and the owner approves the exact DDL application.

## Phase 2 Task 3 — admin read repository

- RED `d619ead792b56376327bdbed6f2aaf1933457878`: 256 pass + one expected missing-module failure.
- GREEN `f8ded33f97fb89ef4343caa77ee3457efbf3b79a`, CI `33634645304`: test/typecheck/build PASS.
- Server-only service-role list/detail reads, strict filters/DTOs, bounded pagination/timeouts, sanitized errors, internal checkout/public fields excluded.

## Phase 2 Task 4 — strict fulfillment repository

- RED `8caf02f9c83611b31c5fe18a03a9764fb8754df6`: 263 pass + one expected missing-module failure.
- GREEN `f27143474c531cf8da49f49c28be42e73a7d8921`, CI `33634997803`: test/typecheck/build PASS.
- Exact atomic RPC only; canonical UUIDs; five admin targets only; strict outcomes; no payment mutation/provider call.

## Phase 2 Task 5 — protected narrow order actions

- RED `46d9760e...`: expected missing `lib/server/admin-order-actions.ts` only.
- GREEN candidate `15fa3e176cc358e797e85b7bff7abdd73e66e580`, CI `33635899966`: test/typecheck/build PASS.
- Five same-origin POST routes wire fixed targets server-side.
- Every write re-authorizes active AAL2 admin access and uses the authenticated principal UUID.
- Browser body cannot choose target status, admin UUID, payment state or audit action.

## Phase 2 Task 6 — shared protected admin shell

- RED `3e3a33cb17f12fae1959d6d3e7be92e1c681ce45`: 276 pass / 4 expected shell/status/page failures.
- GREEN final `58b2fd70a719527a29752e61e2615cf129d77cb9`, CI `33636760106`: test/typecheck/build PASS.
- Shared server shell/navigation/status badges now cover protected operational pages.
- Live nav: Visão geral, Pedidos, Produção, Integrações.
- Login/MFA/setup-MFA remain outside the operational shell.
- Melhor Envio action and page-level auth remain unchanged.

## Phase 2 Task 7 — `/admin/pedidos`

RED commit:

`4af6432b30a83391f762275f75ab660160c1c132`

CI `33645664806`, job `100299636614`:

- 283 tests total;
- 280 PASS;
- 3 expected FAIL;
- all 3 new Task 7 tests failed only because `app/admin/pedidos/page.tsx` did not exist;
- no unrelated regression.

GREEN commit:

`f1aa1fc4e0d11d5e9b058b0544fc5656f15fa4e6`

CI `33645894040`, job `100300413354`:

- `pnpm test`: PASS;
- `pnpm typecheck`: PASS;
- `pnpm build`: PASS.

Implemented protected server-side `/admin/pedidos` with:

- awaited Next.js 16 `searchParams`;
- normalized `q`, payment, fulfillment, attention, date and page filters;
- fixed `sort: 'newest'`, page size 25;
- backend-only `listAdminOrders` use;
- responsive operational cards with local São Paulo timestamp, trusted total fallback, payment/fulfillment badges and attention severity/count;
- detail links only, no financial mutation controls;
- previous/next server pagination preserving active normalized filters;
- no browser Supabase client or forbidden checkout/public internals.

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

**Last verified runtime commit:** `f1aa1fc4e0d11d5e9b058b0544fc5656f15fa4e6` with full CI green.

**Checkpoint documentation commit:** created immediately after Task 7 GREEN; verify branch HEAD before next runtime write.

**NEXT EXACT ACTION:** execute Phase 2 Task 8 with TDD. Extend only `tests/admin-orders-ui.test.ts` first and capture RED for the missing `app/admin/pedidos/[id]/page.tsx` detail page. Then implement the protected detail page using `getAdminOrderById(id)`, `notFound()` for missing orders, parallel order events/open attention/admin audit reads, safe immutable item/address/shipping/payment display, allowed fulfillment controls only, and no raw public token/checkout fingerprint/checkout URL/shipping snapshot. Keep Phase 2 DDL unapplied.
