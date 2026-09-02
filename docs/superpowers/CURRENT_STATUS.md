# ProxyBembem — Current Status

**Updated:** 2026-09-02

Canonical continuation checkpoint. Read this file, `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Branch: `feat/admin-dashboard-expansion`
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`
- Design: `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`
- Active plan: `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`
- State: **PHASE 1 APPLIED/VERIFIED; PHASE 2 TASKS 1–11 CODE/TDD/SECURITY VERIFICATION COMPLETE; WAITING OWNER APPROVAL FOR TASK 12 DDL APPLICATION**
- Merge/new Production application deployment: **NOT APPROVED**

## Phase 1 verified baseline

Phase 1 database foundation is applied to the existing Supabase project `ProxyBembem` (`kicgoocozxzkuoqajqif`) after explicit owner authorization.

Verified:

- 25 existing orders backfilled correctly;
- no fabricated historical events;
- `order_events`, `order_attention_flags`, `admin_audit_log` isolated from browser roles;
- audit/events append-only for service-role usage;
- payment approval/replay/refund/chargeback/manual-review tested transactionally;
- zero persistent validation fixtures;
- Production `/admin` remained healthy after the additive migration.

Owner workflow decision: evolve the existing Supabase project as schema is needed. No paid Supabase development branch is required. Meaningful DDL still requires explicit owner approval before application.

## Vercel Preview

The earlier new-branch Preview `/admin` 500 was diagnosed as environment-scope mismatch. Owner aligned Preview env configuration and a fresh Preview returned `/admin` 200 with the Supabase origin present in CSP.

A temporary branch-specific `ignoreCommand` was later identified during Phase 2 scope review as hosting configuration outside this feature's allowed runtime scope. It was removed in commit `4b1d0e9627f1f67897a96290cac0c576682d5064`, restoring `vercel.json` to its original cron-only content. Preview env configuration remains in Vercel and is independent of this revert.

Do not assume future Preview failures are caused by missing Supabase env without comparing the actual deployment/configuration again.

## Phase 2 migration — verified code, NOT applied

File:

`supabase/migrations/202609020002_admin_order_fulfillment_operations.sql`

Initial SQL implementation: `334d7d1b0bf9fb06e33da08dca16f03ca82384b5`.

Final reviewed SQL candidate is included in runtime candidate `abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7`.

It defines:

- backend-only `admin_list_orders(...) -> jsonb` with bounded static filtering/pagination and `America/Sao_Paulo` date boundaries;
- backend-only locked `admin_transition_order_fulfillment(...) -> jsonb`;
- atomic fulfillment transition + event + append-only admin audit + paid-cancellation attention;
- narrow reversal observer resolving only `canceled_paid_order` after actual `refunded`/`charged_back` payment state;
- service-role-only execution; no browser payment mutation;
- precise paid-cancellation idempotency using the active partial-index target `(order_id, code) WHERE resolved_at IS NULL` rather than generic `ON CONFLICT DO NOTHING`.

**The Phase 2 migration has NOT been applied to Supabase.** Task 12 is the explicit owner-approval gate for applying exactly this reviewed DDL.

## Phase 2 verified implementation evidence

### Tasks 3–6 — backend + protected shell

- Task 3 GREEN `f8ded33f97fb89ef4343caa77ee3457efbf3b79a`, CI `33634645304`: test/typecheck/build PASS.
- Task 4 GREEN `f27143474c531cf8da49f49c28be42e73a7d8921`, CI `33634997803`: PASS.
- Task 5 GREEN `15fa3e176cc358e797e85b7bff7abdd73e66e580`, CI `33635899966`: PASS.
- Task 6 GREEN `58b2fd70a719527a29752e61e2615cf129d77cb9`, CI `33636760106`: PASS.

Implemented server-only reads, strict atomic fulfillment repository, five same-origin/AAL2 fixed-target POST routes, shared admin shell/nav and safe payment/fulfillment badges.

### Task 7 — `/admin/pedidos`

RED `4af6432b30a83391f762275f75ab660160c1c132`, CI `33645664806`: 3 expected failures only because the page was absent.

GREEN `f1aa1fc4e0d11d5e9b058b0544fc5656f15fa4e6`, CI `33645894040`: test/typecheck/build PASS.

Server list includes normalized URL filters, fixed newest sorting, page size 25, attention summary and safe detail links. No financial mutation controls or forbidden checkout internals.

### Task 8 — `/admin/pedidos/[id]`

RED `a52799c6630200229473ce076040c58473a2458c`, CI `33646369062`: 3 expected missing-page failures.

Final GREEN `1dd2446bdd891ddb3de278d753ff5b947c1a227a`, CI `33646901907`: 286 tests + typecheck + build PASS.

Detail loads the order before related history, then bounded events/open attention/order-scoped audit. It shows operational/customer/delivery/freight/Mercado Pago read-only data without checkout internals. Fulfillment actions derive from the approved transition matrix and starting production requires approved payment.

### Task 9 — destructive cancellation confirmation

Valid RED `75cb09222bed107b264c7a4b5fcd5604d5f0e404`, CI `33647606715`: exactly 2 expected failures.

GREEN `d9c1a49be7418ce0bcdb99d4a77ca09502ee0f99`, CI `33647900422`: test/typecheck/build PASS.

`DangerConfirmForm` uses the existing Radix dialog. Opening is a non-submit button; only explicit confirmation performs POST. Only cancellation uses strong confirmation. It receives no admin UUID, payment fields, secrets or hidden inputs.

### Task 10 — `/admin/producao`

RED `53ac9a42aebb18c7a472bab74af6965a74a1d744`, CI `33649908454`:

- 291 tests total;
- 288 PASS;
- exactly 3 expected FAIL because `app/admin/producao/page.tsx` did not exist.

GREEN `40019e592bde1b13d65ba8e1ff16b23504a5827f`, CI `33650042499`:

- `pnpm test`: PASS;
- `pnpm typecheck`: PASS;
- `pnpm build`: PASS.

Page is protected/server-side and loads exactly three oldest-first queues with fixed filters and page size 50: `Aguardando produção`, `Em produção`, `Pronto para envio`. Cards expose only operational summary fields and link to order detail; there are no mutation controls on the queue page.

## Task 11 — final candidate review

Phase 2 baseline for scope comparison: parent of Task 1 RED, `5662704188d7d8555dba148fbb6d8593a74e2c84`.

Scope review initially found one unrelated hosting change (`vercel.json` branch-specific `ignoreCommand`). It was removed in `4b1d0e9627f1f67897a96290cac0c576682d5064`. Re-compare confirmed the final Phase 2 diff contains only allowed migration/server/admin UI/routes/tests/docs work.

Security/concurrency review confirmed:

- no browser payment mutation;
- no browser-supplied admin UUID;
- no browser-supplied arbitrary fulfillment target;
- mutation routes enforce same-origin before admin/storage work and require active AAL2 admin authorization;
- dynamic route params are awaited and UUID-validated;
- five route modules wire fixed server targets;
- list/detail DTOs exclude public token, checkout fingerprint/attempt/URL and shipping snapshot;
- fulfillment RPC locks the order row with `FOR UPDATE`;
- fulfillment update, event, audit and paid-cancel attention are one DB transaction;
- cancellation never changes Mercado Pago payment state;
- actual refund/chargeback resolves only the cancellation-specific alert;
- audit/event append-only privileges remain.

The review also found generic `ON CONFLICT DO NOTHING` on paid-cancel attention. TDD hardening:

- RED `a040701a0327c37ee3d9f732c78c8b6a55cb71a7`, CI `33650490056`: 291 tests, 290 PASS, exactly 1 expected failure requiring the precise partial-index conflict target;
- GREEN/final runtime candidate `abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7`, CI `33650730746`, job `100316764581`;
- `pnpm test`: PASS;
- `pnpm typecheck`: PASS;
- `pnpm build`: PASS.

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

Starting production requires `payment_status = 'approved'`. Mercado Pago remains authoritative for financial state.

## Safety gates

- Phase 2 DDL is not applied yet.
- Do not merge the feature branch without explicit owner approval.
- Do not promote/create a new Production application deployment without explicit owner approval.
- Task 12 SQL application must use the exact reviewed migration and current Supabase project only after explicit owner approval.
- After DDL, validate RPCs/permissions/transitions with transaction+rollback fixtures before accepting the DB gate.

## Resume point

**Last verified runtime/test commit:** `abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7`, CI `33650730746`, test/typecheck/build PASS.

**Current task:** Phase 2 Task 12 approval gate.

**NEXT EXACT ACTION:** obtain explicit owner approval to apply `supabase/migrations/202609020002_admin_order_fulfillment_operations.sql` from candidate `abe96b66fbe3fa7ce260e1321e383e9f1b40f7d7` to existing Supabase project `ProxyBembem` (`kicgoocozxzkuoqajqif`). After approval, apply only that migration, validate functions/grants/triggers and run transaction+rollback tests for valid transitions, invalid jumps, payment precondition, replay/concurrency behavior, paid cancellation and actual reversal; prove zero validation fixtures persist. Do not merge or deploy Production application code during this step.
