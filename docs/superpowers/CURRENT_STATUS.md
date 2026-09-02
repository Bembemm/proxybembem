# ProxyBembem — Current Status

**Updated:** 2026-09-02

Canonical continuation checkpoint. Read this file, `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`.

## Active project

- Project: Admin Dashboard + Customer Account Expansion
- Branch: `feat/admin-dashboard-expansion`
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`
- Design: `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`
- Active plan: `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`
- State: **PHASE 1 APPLIED/VERIFIED; PHASE 2 TASKS 1–8 TDD COMPLETE THROUGH ADMIN ORDER DETAIL; TASK 9 NEXT**
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

## Phase 2 Tasks 3–6 — verified backend/shell baseline

- Task 3 GREEN `f8ded33f97fb89ef4343caa77ee3457efbf3b79a`, CI `33634645304`: test/typecheck/build PASS.
- Task 4 GREEN `f27143474c531cf8da49f49c28be42e73a7d8921`, CI `33634997803`: test/typecheck/build PASS.
- Task 5 GREEN candidate `15fa3e176cc358e797e85b7bff7abdd73e66e580`, CI `33635899966`: test/typecheck/build PASS.
- Task 6 GREEN final `58b2fd70a719527a29752e61e2615cf129d77cb9`, CI `33636760106`: test/typecheck/build PASS.
- Server-only reads, exact atomic fulfillment RPC, five same-origin/AAL2 fixed-target POST routes and shared protected admin shell are in place.

## Phase 2 Task 7 — `/admin/pedidos`

RED `4af6432b30a83391f762275f75ab660160c1c132`, CI `33645664806`:

- 283 tests total;
- 280 PASS;
- 3 expected FAIL only because `app/admin/pedidos/page.tsx` did not exist.

GREEN `f1aa1fc4e0d11d5e9b058b0544fc5656f15fa4e6`, CI `33645894040`:

- `pnpm test`: PASS;
- `pnpm typecheck`: PASS;
- `pnpm build`: PASS.

Implemented protected server-side orders list with normalized URL filters, fixed newest sort, page size 25, safe operational summaries, payment/fulfillment badges, attention indicators, detail links and server pagination preserving filters. No browser payment mutation or forbidden checkout internals.

## Phase 2 Task 8 — `/admin/pedidos/[id]`

RED `a52799c6630200229473ce076040c58473a2458c`, CI `33646369062`:

- 286 tests total;
- 283 PASS;
- exactly 3 expected FAIL;
- all three new detail tests failed only because `app/admin/pedidos/[id]/page.tsx` did not exist.

Initial GREEN implementation `2b9702a41915bd98fd71d98d28eac009ac10e0c9` exposed one test-contract issue: 285/286 tests passed, with the only failure caused by a brittle regex requiring quotes around the valid JavaScript object key `updated:`. Root cause was investigated under the systematic-debugging workflow; runtime behavior was not changed.

Final Task 8 verification commit `1dd2446bdd891ddb3de278d753ff5b947c1a227a`, CI `33646901907`, job `100303818431`:

- 286 tests PASS;
- `pnpm typecheck`: PASS;
- `pnpm build`: PASS.

Implemented protected server-side detail with:

- awaited/validated dynamic order ID;
- order loaded before related history, missing order -> `notFound()`;
- parallel order events, open attention and order-scoped admin audit reads only after the order exists;
- sections for summary, production, alerts, immutable item snapshot, customer, delivery, freight, Mercado Pago read-only information, timeline and audit;
- local São Paulo timestamps and trusted total fallback;
- `allowedAdminFulfillmentTransitions`-derived controls only;
- start-production hidden unless Mercado Pago status is approved;
- hardcoded redirect feedback only for `updated`, `unchanged`, `invalid-transition`, `payment-required`;
- explicit cancellation copy stating operational cancellation does not automatically refund Mercado Pago and financial follow-up remains until provider reversal;
- no raw public/checkout internals or browser Supabase client.

Task 9 will replace only the destructive cancellation control with an accessible client-side confirmation primitive. Ordinary production transitions remain direct POST forms.

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

**Last verified runtime/test commit:** `1dd2446bdd891ddb3de278d753ff5b947c1a227a` with full CI green.

**NEXT EXACT ACTION:** execute Phase 2 Task 9 with TDD. Extend UI tests first to require an accessible destructive confirmation around cancellation only. Then create `components/admin/danger-confirm-form.tsx` using the already installed Radix dialog primitive and replace only the cancellation `ActionForm` in `app/admin/pedidos/[id]/page.tsx`. Safe props only: action URL, button label, title, description, confirm label. Opening must not submit; final form remains POST; no server/admin/payment secrets in the client component. Keep ordinary production transitions direct POST and keep Phase 2 DDL unapplied.
