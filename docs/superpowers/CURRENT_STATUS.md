# ProxyBembem — Current Status

**Updated:** 2026-09-02

Canonical continuation checkpoint. Read this file, then `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`, then the active phase plan.

## Active project

**Admin Dashboard + Customer Account Expansion**

- Branch: `feat/admin-dashboard-expansion`
- Base: `main` at `b7172e86ec5bc1c4a773e99ef0886ce512649110`
- Design: `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`
- Master Plan: `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`
- Active plan: `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`
- State: **PHASE 1 VERIFIED; PHASE 2 PLAN WRITTEN/REVIEWED; PHASE 2 RUNTIME NOT STARTED**
- Merge/new Production application deployment: **NOT APPROVED**

## Phase 1 — verified foundation

Verified implementation candidate:

`0ce3b371eda1cfccbd8ddde639b07e7b7ae57848`

CI run `33590493640`, job `100123329614`:

- `pnpm test`: PASS
- `pnpm typecheck`: PASS
- `pnpm build`: PASS

Documentation checkpoint `11eb39252cb8c00cdc64336582b53e69b5fb10a6` also passed all three gates in CI `33590734705`.

Implemented/verified:

- compatibility-safe `orders.fulfillment_status`;
- `order_events`;
- `order_attention_flags`;
- append-only `admin_audit_log`;
- automatic trusted payment approval -> `awaiting_production` only;
- refund/chargeback attention without rewinding physical state;
- manual-review attention on amount/currency mismatch;
- fulfillment transition vocabulary;
- recursive safe metadata;
- order event/attention/audit repositories;
- strict branch payment-RPC response parser.

Append-only DB privilege verification after Phase 1:

- `service_role` can SELECT/INSERT `admin_audit_log`;
- `service_role` cannot UPDATE/DELETE `admin_audit_log`;
- `service_role` cannot UPDATE/DELETE `order_events`.

### Phase 1 TDD/debug evidence

- migration RED `bcebfdc71e28f7b54141e7f32a97f45c5782bb41`;
- migration GREEN `bdf02ffd76a3c63efd0fe617bada587965af7171`;
- fulfillment GREEN `f880fa4a420932f6112cb3800ad86afdbb31f2ff`;
- payment contract RED `dbd2496fc4416fba374da9addc058d370f0a6b5e`;
- stabilized contract `1f1ba69dd61ed9c41d4abb4489f30d325a669be9` full CI PASS;
- order events GREEN `186d34d109c4bc6a41a02c7b8b172ae8838303e4` full CI PASS;
- attention RED `cadb3d30a46a1eea2d11ed9b43779a1fd9175abf`, GREEN `7ae5338b640f15f78554cb5c71ae5351643a5e3c` full CI PASS;
- audit RED `2b6af16a5362d8d7e8e75d3a5850ee9708ae1da6`, GREEN `0ce3b371...` full CI PASS.

Two temporary CI regressions during Phase 1 were traced with systematic debugging to stale test fixtures (`webhook-route.test.ts` and `order-display.test.ts`), not runtime webhook logic.

## Supabase execution model

Connected project:

- name: `ProxyBembem`
- project ref: `kicgoocozxzkuoqajqif`
- region: `sa-east-1`
- healthy
- development branches: none

Owner explicitly confirmed the established project workflow: use this existing Supabase project and add schema as needed. A paid Supabase development branch is **not** a prerequisite and must not be reintroduced as one.

Meaningful DDL on the current project still stops for explicit owner approval before application.

### Applied Phase 1 migration

Supabase migration record:

`20260902091641_admin_order_operations_foundation`

Post-application evidence:

- existing orders checked: 25;
- fulfillment NULLs: 0;
- approved wrong backfill: 0;
- non-approved wrong backfill: 0;
- new tables present and RLS enabled;
- anon/authenticated cannot read operational history tables;
- anon/authenticated cannot execute the payment RPC;
- service_role has required access;
- controlled transaction+rollback validated approval, replay idempotency, refund, chargeback, manual_review;
- persistent validation fixture rows: 0.

Supabase advisor results were reviewed. Backend-only RLS/no-policy and just-created unused-index notices are intentional/expected. Pre-existing leaked-password protection warning is deferred to customer account/auth hardening.

## Vercel state

Project: `prj_ltpEFQ1h55qeQKLdmiyZv2Oc21OI`

Team: `team_bwSLmhPDu6WucdPzwitIvS2P`

Known branch Preview from Phase 1:

- deployment `dpl_Eb7dUhzmbN5JMzYUn5Knav85mUau`
- READY
- `/`: 200
- `/admin`: 500

Confirmed root cause:

`Missing required public environment variable: NEXT_PUBLIC_SUPABASE_URL`

The available Vercel connector cannot edit environment variables. Preview admin is **NOT APPROVED** until the Preview env contract is configured. At minimum the protected admin flow expects:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ADMIN_USER_ID
SUPABASE_URL
SUPABASE_SECRET_KEY
```

Existing provider/integration routes may also require their already-documented env values.

Current Production application after Phase 1 DB migration:

- `https://www.proxybembem.com.br/admin`: 200 protected login surface;
- error/fatal runtime logs in validation window: none;
- Production application code/deployment remains the pre-expansion main baseline.

## Phase 2 — Admin Orders + Fulfillment

Detailed plan:

`docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md`

Initial plan commit: `799bdba6a3ace3707054556d0f0f1c4aa50ff72a`

Reviewed plan commit: `963c2d316451b62d43422d8685631a4cde33f177`

Master checkpoint after review: `b7d3923359593f2b28f562c92d374fc18dd9fba1`

### Phase 2 review decisions future chats must not rediscover

- list RPC returns `{orders,total}`, including empty/out-of-range pages;
- search input escapes `%`, `_`, and `\` as literal values;
- admin date filters use `America/Sao_Paulo` calendar-day boundaries;
- attention severity is deterministic `critical > warning > info`;
- payment filters accept only safe exact status-code syntax, while unknown provider status display falls back neutrally;
- transition target is fixed by the server route, never browser input;
- DB row lock is final concurrency authority;
- transition + event + audit + required attention are atomic;
- paid cancellation does **not** refund and opens `canceled_paid_order`;
- actual provider `refunded`/`charged_back` later resolves only `canceled_paid_order`; reversal-specific attention remains;
- action handler uses one fixed redirect/error mapping, not implementation alternatives;
- Next.js 16 dynamic `params`/`searchParams` are awaited;
- login/MFA routes stay outside the shared protected content shell;
- audit/order-events append-only privileges must remain unchanged;
- Phase 2 DDL is not applied until the full code candidate is tested/re-reviewed and owner explicitly approves that exact migration.

### Planned Phase 2 runtime

- static bounded `admin_list_orders` RPC;
- atomic `admin_transition_order_fulfillment` RPC;
- paid-cancellation reversal observer;
- backend admin order read repository;
- strict fulfillment operation repository;
- five narrow POST action routes;
- shared current-style admin shell;
- `/admin/pedidos`;
- `/admin/pedidos/[id]`;
- destructive cancel confirmation;
- `/admin/producao`;
- focused/full verification;
- separate owner gate before current-Supabase Phase 2 DDL;
- Preview smoke only after Preview env is fixed;
- separate owner gate before merge/new Production application deployment.

## Architectural decisions

- Modular monolith.
- `/admin` remains readable; authorization/MFA is the security boundary.
- Payment is provider-authoritative.
- Fulfillment is independent.
- Automatic fulfillment transition only on trusted approved payment from awaiting-payment.
- Refund/chargeback does not falsify physical state.
- No generic arbitrary admin order/payment PATCH.
- Customer account later remains optional; guest checkout remains.
- Catalog later moves to Supabase in stages; browser price never trusted.
- Label purchase always manual/explicit.
- Transactional email later uses outbox isolation.
- Store settings contain no infrastructure secrets.
- No fabricated historical facts.
- `IMPLEMENTED`, `TESTED`, `PREVIEW APPROVED`, `PRODUCTION APPROVED` remain distinct.
- Do not delete feature branches unless owner explicitly asks.

## End-of-session rule

Every meaningful session updates this file with exact phase/task, fresh evidence, blocker, next action, branch/commit, database/Preview/Production state, and decisions that must not be rediscovered.

**Resume point:** Phase 1 is verified and applied to the current Supabase DB. Phase 2 design/implementation plan is reviewed. No Phase 2 runtime file or migration exists yet. Preview admin env blocker remains open. **NEXT EXACT ACTION:** create only `tests/admin-order-operations-migration.test.ts`, commit the RED, confirm failure is solely the missing `supabase/migrations/202609020002_admin_order_fulfillment_operations.sql`, then and only then write Phase 2 SQL.