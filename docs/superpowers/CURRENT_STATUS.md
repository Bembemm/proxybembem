# ProxyBembem — Current Status

**Updated:** 2026-09-02

Canonical continuation checkpoint. Read this file, `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then the active phase plan.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Branch: `feat/admin-dashboard-expansion`
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`
- Design: `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`
- Active plan: `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`
- State: **PHASE 1 VERIFIED; PHASE 2 TASK 1 RED VERIFIED; TASK 2 GREEN MIGRATION NEXT**
- Merge/new Production application deployment: **NOT APPROVED**

## Phase 1 verified baseline

Verified code candidate:

`0ce3b371eda1cfccbd8ddde639b07e7b7ae57848`

CI `33590493640`, job `100123329614`:

- `pnpm test`: PASS
- `pnpm typecheck`: PASS
- `pnpm build`: PASS

Phase 1 current-Supabase migration:

`20260902091641_admin_order_operations_foundation`

Applied after explicit owner authorization. Validation proved:

- 25 existing orders checked;
- fulfillment NULLs 0;
- approved wrong backfill 0;
- non-approved wrong backfill 0;
- operational history/attention/audit tables present with RLS;
- browser roles blocked from backend-only history;
- payment RPC grants/security intact;
- approval/replay/refund/chargeback/manual-review transaction tests passed;
- 0 persistent validation fixtures.

Append-only privilege check:

- service_role can SELECT/INSERT admin audit;
- service_role cannot UPDATE/DELETE admin audit;
- service_role cannot UPDATE/DELETE order events.

Production after Phase 1 DB migration:

- `/admin`: 200 protected login surface;
- validation-window error/fatal logs: none;
- Production app code/deployment remains pre-expansion main.

## Supabase workflow decision

Connected project: `ProxyBembem`, ref `kicgoocozxzkuoqajqif`, `sa-east-1`, healthy.

Owner explicitly confirmed the established workflow: evolve this current Supabase project as schema is needed. Do not reintroduce a paid Supabase development branch as a prerequisite. Meaningful current-project DDL still requires explicit owner approval before application.

## Preview blocker

Known Preview deployment from Phase 1 is READY and `/` is 200, but `/admin` returns 500 because Preview lacks:

`NEXT_PUBLIC_SUPABASE_URL`

At minimum protected Preview admin needs these env names configured without committing values:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ADMIN_USER_ID
SUPABASE_URL
SUPABASE_SECRET_KEY
```

The connected Vercel tooling cannot mutate env vars. Preview remains **NOT APPROVED**.

## Phase 2 plan

Plan:

`docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`

Reviewed plan commit:

`963c2d316451b62d43422d8685631a4cde33f177`

Review locked these details:

- admin list RPC returns `{orders,total}` even on empty/out-of-range pages;
- search `%`, `_`, `\` is literal, not wildcard control;
- date filters use `America/Sao_Paulo` calendar boundaries;
- attention severity deterministic `critical > warning > info`;
- unknown future provider payment statuses render neutrally;
- browser never chooses arbitrary fulfillment target;
- DB row lock is final transition authority;
- transition + event + audit + required attention are atomic;
- paid cancellation does not refund and opens `canceled_paid_order`;
- actual `refunded`/`charged_back` later resolves only the cancellation-specific alert;
- one fixed action-handler redirect/error mapping;
- Next.js 16 async params/searchParams explicitly handled;
- append-only history privileges stay unchanged;
- Phase 2 DDL application has a separate owner gate after code/CI review.

## Phase 2 Task 1 — RED evidence

Test-only commit:

`75f3a0752ee6fa6e80a821c4be23fb3a7f17e1e4`

GitHub CI:

- run `33615089014`
- job `100198954546`
- total tests: 256
- pass: 252
- fail: 4

All four failures are **only** `tests/admin-order-operations-migration.test.ts`, and every failure is the expected:

```text
ENOENT: no such file or directory
supabase/migrations/202609020002_admin_order_fulfillment_operations.sql
```

No unrelated test failed. This is valid TDD RED evidence. No Phase 2 SQL/runtime implementation existed when the RED was captured.

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

Starting production requires approved payment. Payment remains provider-authoritative.

## Safety gates

- Phase 2 migration is **not** applied to Supabase yet.
- Do not apply it merely because the SQL test turns green.
- First complete/review the Phase 2 code candidate and full CI.
- Then stop for explicit owner approval of the exact Phase 2 DDL.
- Do not merge the feature branch or create a new Production application deployment without explicit owner approval.

## Resume point

**Current branch HEAD before next implementation commit:** documentation checkpoint after RED.

**NEXT EXACT ACTION:** create `supabase/migrations/202609020002_admin_order_fulfillment_operations.sql` with the reviewed static list RPC, locked atomic transition RPC, paid-cancellation attention lifecycle, service-role-only grants, and no payment writer. Run the focused Phase 2 migration test plus Phase 1 payment/fulfillment regression tests. Do **not** apply this Phase 2 migration to Supabase yet.