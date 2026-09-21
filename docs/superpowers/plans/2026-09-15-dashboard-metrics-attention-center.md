# Phase 8 Dashboard Metrics + Attention Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/admin` into a trustworthy operational dashboard with DB-derived period metrics, current fulfillment queues, a read-only Attention Center, and approved product-sales rankings.

**Architecture:** Add one read-only service-role-only Supabase RPC that captures a single São Paulo `as_of` instant and returns the complete dashboard snapshot. A strict Next.js server repository validates that snapshot and the protected force-dynamic `/admin` page renders it without browser-side authority or fallback zeros.

**Tech Stack:** Next.js 16.3.3, React 19, TypeScript 5.7.3, Supabase/PostgreSQL, Node.js 22.x, pnpm 10, `node:test`, Tailwind CSS, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-15-dashboard-metrics-attention-center-design.md`

## Global Constraints

- Calendar timezone is exactly `America/Sao_Paulo`.
- Today = local 00:00 to one shared `as_of`; week = Monday 00:00 to `as_of`; month = day 1 00:00 to `as_of`.
- Approval/reversal timing comes only from trustworthy Mercado Pago `order_events`, never `orders.created_at`.
- Approved gross and reversed value remain independent historical facts; no fabricated net revenue.
- Repeated approval/reversal events must not double-count an order.
- Product quantities come from immutable `orders.items` snapshots of approved orders.
- Attention Center is read-only; no generic resolve/dismiss action.
- Dashboard reads are server-only, `cache: "no-store"`, service-role-backed, and fail visibly rather than returning synthetic zeros.
- No provider API call, spend, cancellation, order mutation, notification send, or Store Settings mutation belongs in Phase 8.
- Existing admin authorization remains owner UUID + Supabase session + AAL2/TOTP + active admin session.
- Existing migrations are never rewritten or reapplied; Phase 8 is additive.
- Vercel runtime remains Node.js `22.1.0`; pnpm major remains `10`.

---

## File Structure

### New files

- `supabase/migrations/202609150001_dashboard_metrics_attention_center.sql` — authoritative read-only dashboard aggregation RPC and only evidence-driven supporting indexes.
- `lib/server/admin-dashboard.ts` — strict snapshot types, parser, Supabase RPC client, and safe attention-code labels.
- `components/admin/dashboard-period-card.tsx` — one today/week/month metric card.
- `components/admin/dashboard-operations.tsx` — current fulfillment and current financial-risk cards.
- `components/admin/dashboard-attention-center.tsx` — read-only top attention queue and severity summary.
- `components/admin/dashboard-product-sales.tsx` — current-month product quantity ranking.
- `tests/admin-dashboard-migration.test.ts` — SQL contract tests.
- `tests/admin-dashboard-repository.test.ts` — repository/parser/failure tests.
- `tests/admin-dashboard-ui.test.ts` — source/UI contract regression tests.

### Existing files modified

- `app/admin/page.tsx` — protected server load, visible failure state, assembled dashboard, retained integration utility link.
- `docs/superpowers/CURRENT_STATUS.md` — mark Phase 8 active after implementation checkpoint.
- `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md` — replace Phase 8 “NOT STARTED” with current implementation checkpoint.
- `docs/PROJECT_MASTER_OVERVIEW.md` — update roadmap/checkpoint only after automated implementation is green.

---

### Task 1: Define the authoritative SQL snapshot contract

**Files:**
- Create: `tests/admin-dashboard-migration.test.ts`
- Create: `supabase/migrations/202609150001_dashboard_metrics_attention_center.sql`

**Interfaces:**
- Consumes: existing `public.orders`, `public.order_events`, `public.order_attention_flags`.
- Produces: `public.admin_get_dashboard_snapshot() returns jsonb`, executable only by `service_role`.

- [ ] **Step 1: Write the failing migration contract test**

Create `tests/admin-dashboard-migration.test.ts` with focused assertions that require the approved design rather than exact SQL formatting:

```ts
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609150001_dashboard_metrics_attention_center.sql",
  import.meta.url,
)

async function sql() {
  return readFile(MIGRATION, "utf8")
}

test("dashboard snapshot RPC is read-only service-role-only and timezone explicit", async () => {
  const text = await sql()
  assert.match(text, /create\s+or\s+replace\s+function\s+public\.admin_get_dashboard_snapshot\s*\(\s*\)/i)
  assert.match(text, /returns\s+jsonb/i)
  assert.match(text, /security\s+definer/i)
  assert.match(text, /set\s+search_path\s*=\s*''/i)
  assert.match(text, /America\/Sao_Paulo/)
  assert.match(text, /revoke\s+all[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i)
  assert.match(text, /grant\s+execute[\s\S]*to\s+service_role/i)
})

test("dashboard finance uses trusted Mercado Pago events with first-event dedupe", async () => {
  const text = await sql()
  assert.match(text, /order_events/i)
  assert.match(text, /event_type\s*=\s*'payment_status_changed'/i)
  assert.match(text, /source\s*=\s*'mercadopago'/i)
  assert.match(text, /metadata\s*->>\s*'payment_status'\s*=\s*'approved'/i)
  assert.match(text, /refunded/i)
  assert.match(text, /charged_back/i)
  assert.match(text, /distinct\s+on\s*\(\s*[^)]*order_id/i)
  assert.match(text, /coalesce\s*\(\s*[^,]*total_cents\s*,\s*[^)]*subtotal_cents/i)
})

test("dashboard exposes current operation and distinct-order attention metrics", async () => {
  const text = await sql()
  for (const status of ["awaiting_production", "in_production", "ready_to_ship", "shipped"]) {
    assert.match(text, new RegExp(status))
  }
  assert.match(text, /order_attention_flags/i)
  assert.match(text, /resolved_at\s+is\s+null/i)
  assert.match(text, /critical[\s\S]*warning[\s\S]*info/i)
  assert.match(text, /limit\s+5/i)
})

test("dashboard product sales expand immutable item snapshots and limit ranking", async () => {
  const text = await sql()
  assert.match(text, /jsonb_array_elements\s*\(\s*[^)]*items/i)
  assert.match(text, /productId/)
  assert.match(text, /quantity/)
  assert.match(text, /limit\s+10/i)
})
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```bash
node --experimental-strip-types --test tests/admin-dashboard-migration.test.ts
```

Expected: FAIL with `ENOENT` for `202609150001_dashboard_metrics_attention_center.sql`.

- [ ] **Step 3: Implement the migration with one shared `as_of`**

Create `supabase/migrations/202609150001_dashboard_metrics_attention_center.sql` as a `plpgsql` function. Use this structure and exact trust rules:

```sql
create or replace function public.admin_get_dashboard_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_as_of timestamptz := now();
  v_local_now timestamp;
  v_today_start timestamptz;
  v_week_start timestamptz;
  v_month_start timestamptz;
  v_result jsonb;
begin
  v_local_now := v_as_of at time zone 'America/Sao_Paulo';
  v_today_start := date_trunc('day', v_local_now) at time zone 'America/Sao_Paulo';
  v_week_start := date_trunc('week', v_local_now) at time zone 'America/Sao_Paulo';
  v_month_start := date_trunc('month', v_local_now) at time zone 'America/Sao_Paulo';

  with first_approvals as (
    select distinct on (ev.order_id)
      ev.order_id,
      ev.created_at as approved_at
    from public.order_events ev
    where ev.event_type = 'payment_status_changed'
      and ev.source = 'mercadopago'
      and ev.metadata ->> 'payment_status' = 'approved'
    order by ev.order_id, ev.created_at asc, ev.id asc
  ),
  first_reversals as (
    select distinct on (ev.order_id)
      ev.order_id,
      ev.created_at as reversed_at
    from public.order_events ev
    where ev.event_type = 'payment_status_changed'
      and ev.source = 'mercadopago'
      and ev.metadata ->> 'payment_status' in ('refunded', 'charged_back')
    order by ev.order_id, ev.created_at asc, ev.id asc
  )
  -- continue with bounded CTEs for order counts, money sums, current queues,
  -- per-order highest attention severity/top 5, and month product quantities.
  select jsonb_build_object(/* exact contract from the spec */)
    into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_get_dashboard_snapshot()
  from public, anon, authenticated;
grant execute on function public.admin_get_dashboard_snapshot()
  to service_role;
```

The completed SQL must not contain comments standing in for implementation. Build all values from persisted rows. For money sums use `coalesce(o.total_cents, o.subtotal_cents)`. For attention, first compute one highest severity per order, then select one primary flag for that highest severity ordered `opened_at asc, id asc`; top queue ordering is severity rank descending then `opened_at asc`, limit 5. For products, join current-month `first_approvals` to `orders`, expand `orders.items`, sum positive integer snapshot `quantity`, group by integer snapshot `productId`, and choose the title from the most recent approved snapshot row for that product; order quantity desc/product ID asc and limit 10.

Do not add an index unless `EXPLAIN` or existing-index inspection later shows the RPC needs one. Existing `order_events_order_created_idx`, fulfillment index, and open-attention index are the baseline.

- [ ] **Step 4: Run migration contract test GREEN**

Run:

```bash
node --experimental-strip-types --test tests/admin-dashboard-migration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run existing migration regressions**

Run:

```bash
node --experimental-strip-types --test \
  tests/admin-order-foundation-migration.test.ts \
  tests/admin-order-operations-migration.test.ts \
  tests/customer-account-migration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add tests/admin-dashboard-migration.test.ts supabase/migrations/202609150001_dashboard_metrics_attention_center.sql
git commit -m "feat: add dashboard snapshot rpc"
```

---

### Task 2: Add a strict server dashboard repository

**Files:**
- Create: `tests/admin-dashboard-repository.test.ts`
- Create: `lib/server/admin-dashboard.ts`

**Interfaces:**
- Consumes: `getSupabaseEnv()` from `lib/server/env.ts`; RPC `admin_get_dashboard_snapshot()` from Task 1.
- Produces: `getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot>` and `getAttentionReasonLabel(code: string): string`.

- [ ] **Step 1: Write the failing repository test with a canonical payload**

Create a fixture matching the spec exactly:

```ts
const ORDER_ID = "11111111-1111-4111-8111-111111111111"

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    asOf: "2026-09-15T12:00:00.000Z",
    timezone: "America/Sao_Paulo",
    ordersCreated: { today: 2, week: 4, month: 7 },
    approvedGrossCents: { today: 11990, week: 23980, month: 59950 },
    reversedCents: { today: 0, week: 11990, month: 11990 },
    financialRisk: { manualReview: 1, refunded: 1, chargedBack: 0 },
    operations: { awaitingProduction: 2, inProduction: 1, readyToShip: 1, shipped: 3 },
    attention: {
      totalOrders: 1,
      criticalOrders: 1,
      warningOrders: 0,
      infoOrders: 0,
      topItems: [{
        orderId: ORDER_ID,
        orderNumber: "PB-A1B2C3D4E5F6",
        customerName: "Cliente Teste",
        severity: "critical",
        flagCount: 2,
        primaryCode: "payment_manual_review",
        primarySource: "mercadopago",
        openedAt: "2026-09-15T11:00:00.000Z",
      }],
    },
    productsThisMonth: [{ productId: 1, title: "Deck Commander Proxy 100 Cartas", quantity: 3 }],
    ...overrides,
  }
}
```

Test that `getAdminDashboardSnapshot()` POSTs to exactly `/rest/v1/rpc/admin_get_dashboard_snapshot`, sends the service key, uses `cache: "no-store"`, sends `{}` as the body, and returns the validated fixture unchanged.

- [ ] **Step 2: Add RED validation/failure cases**

Use `node:test` mocks following `tests/admin-orders-repository.test.ts`. Assert rejection for:

```ts
snapshot({ timezone: "UTC" })
snapshot({ asOf: "not-a-date" })
snapshot({ ordersCreated: { today: -1, week: 4, month: 7 } })
snapshot({ approvedGrossCents: { today: 1.2, week: 2, month: 3 } })
snapshot({ attention: { ...snapshot().attention, totalOrders: 2 } }) // buckets no longer sum
snapshot({ attention: { ...snapshot().attention, topItems: Array(6).fill(snapshot().attention.topItems[0]) } })
snapshot({ productsThisMonth: Array(11).fill(snapshot().productsThisMonth[0]) })
```

Also test invalid attention UUID, severity, `flagCount: 0`, product `productId: 0`, empty/oversized strings, a network rejection, and a non-2xx Supabase response.

- [ ] **Step 3: Run targeted test RED**

```bash
node --experimental-strip-types --test tests/admin-dashboard-repository.test.ts
```

Expected: FAIL because `lib/server/admin-dashboard.ts` does not exist.

- [ ] **Step 4: Implement strict parser and RPC client**

Create `lib/server/admin-dashboard.ts` with exported types from the spec and these rules:

```ts
export async function getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  const response = await adminDashboardRequest("rpc/admin_get_dashboard_snapshot", {
    method: "POST",
    body: JSON.stringify({}),
  })
  return parseAdminDashboardSnapshot(await response.json())
}
```

`adminDashboardRequest()` must use `getSupabaseEnv()`, `apikey: supabaseSecretKey`, JSON headers, `cache: "no-store"`, and `AbortSignal.timeout(10_000)`. Log only operation/resource/status on failure; never log payloads or keys. Throw a bounded message such as `Admin dashboard storage request failed`.

Parser requirements:

- objects must be plain records;
- counters/cents must be nonnegative safe integers;
- UUIDs use the same canonical regex pattern already used by admin orders;
- timestamps must parse to finite dates;
- timezone must equal `America/Sao_Paulo`;
- attention severity is exactly `critical | warning | info`;
- `topItems.length <= 5`, `productsThisMonth.length <= 10`;
- attention severity buckets must sum to `totalOrders`;
- bounded display strings: order number <= 100, customer <= 500, code/source <= 64, title <= 500;
- product ID and quantity are positive safe integers.

Add `getAttentionReasonLabel()` with an allowlisted mapping for known current codes, including at least:

```ts
const ATTENTION_LABELS: Record<string, string> = {
  payment_manual_review: "Pagamento precisa de revisão",
  payment_refunded: "Pagamento reembolsado",
  payment_charged_back: "Pagamento contestado (chargeback)",
  canceled_paid_order: "Pedido pago foi cancelado",
}
```

Return `"Pedido requer atenção"` for unknown codes. Do not expose metadata.

- [ ] **Step 5: Run repository tests GREEN**

```bash
node --experimental-strip-types --test tests/admin-dashboard-repository.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run adjacent server repository tests**

```bash
node --experimental-strip-types --test \
  tests/admin-orders-repository.test.ts \
  tests/order-attention.test.ts \
  tests/admin-dashboard-repository.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add tests/admin-dashboard-repository.test.ts lib/server/admin-dashboard.ts
git commit -m "feat: add admin dashboard repository"
```

---

### Task 3: Build presentational dashboard components

**Files:**
- Create: `components/admin/dashboard-period-card.tsx`
- Create: `components/admin/dashboard-operations.tsx`
- Create: `components/admin/dashboard-attention-center.tsx`
- Create: `components/admin/dashboard-product-sales.tsx`
- Create: `tests/admin-dashboard-ui.test.ts`

**Interfaces:**
- Consumes: `AdminDashboardSnapshot`, `getAttentionReasonLabel` from `lib/server/admin-dashboard.ts`.
- Produces: small server-renderable presentational components with no fetch, mutation, effect, or provider call.

- [ ] **Step 1: Write RED UI source-contract tests**

Create `tests/admin-dashboard-ui.test.ts` using `readFile()` patterns used elsewhere in the repository. Require:

```ts
assert.match(periodCard, /Hoje/)
assert.match(periodCard, /Semana/)
assert.match(periodCard, /Mês/)
assert.match(attention, /Requer atenção/)
assert.match(attention, /Ver todos/)
assert.match(attention, /\/admin\/pedidos\?attention=1/)
assert.match(attention, /\/admin\/pedidos\/\$\{item\.orderId\}/)
assert.doesNotMatch(attention, /metadata/)
assert.match(products, /Produtos vendidos no mês/)
assert.match(operations, /Aguardando produção/)
assert.match(operations, /Em produção/)
assert.match(operations, /Pronto para envio/)
assert.match(operations, /Enviados/)
assert.match(operations, /Em revisão/)
assert.match(operations, /Reembolsados/)
assert.match(operations, /Chargebacks/)
```

Also require that none of the component files use `"use client"`, `useEffect`, `fetch(`, or mutation form actions.

- [ ] **Step 2: Run UI tests RED**

```bash
node --experimental-strip-types --test tests/admin-dashboard-ui.test.ts
```

Expected: FAIL because the component files do not exist.

- [ ] **Step 3: Implement period metric card**

`DashboardPeriodCard` props:

```ts
{
  title: string
  description: string
  today: string
  week: string
  month: string
  icon: LucideIcon
  tone?: "default" | "warning"
}
```

Render one accessible card with the three labels Hoje/Semana/Mês. Pass already formatted money/count strings so this component has no business math.

- [ ] **Step 4: Implement operations/risk component**

`DashboardOperations` receives `snapshot.operations` and `snapshot.financialRisk`. Render four current fulfillment cards plus a compact three-item financial-risk strip. These are current-state counts, not period metrics.

- [ ] **Step 5: Implement read-only Attention Center**

`DashboardAttentionCenter` receives `snapshot.attention` and `asOf`. Render severity summary, then at most five items. Each item must show safe label from `getAttentionReasonLabel(item.primaryCode)`, order number, customer, severity, flag count, opening age/date, and a direct details link.

Use explicit severity visual mapping; never render `primaryCode`, `primarySource`, or raw metadata as user-facing technical text unless needed for an accessible hidden/debug purpose. The user-facing reason comes from the allowlist helper.

When `topItems` is empty, render `Nenhum pedido requer atenção agora.`

- [ ] **Step 6: Implement current-month product ranking**

`DashboardProductSales` receives `productsThisMonth`. Render title + quantity, deterministic order from the snapshot, and an empty state `Nenhuma venda aprovada neste mês.`. No current catalog fetch is allowed.

- [ ] **Step 7: Run UI tests GREEN**

```bash
node --experimental-strip-types --test tests/admin-dashboard-ui.test.ts
```

Expected: PASS.

- [ ] **Step 8: Typecheck the new components**

```bash
npx pnpm@10 typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git add components/admin/dashboard-*.tsx tests/admin-dashboard-ui.test.ts
git commit -m "feat: add dashboard overview components"
```

---

### Task 4: Wire `/admin` with protected server data and visible failure behavior

**Files:**
- Modify: `app/admin/page.tsx`
- Modify: `tests/admin-dashboard-ui.test.ts`
- Test: `tests/admin-auth-ui.test.ts`

**Interfaces:**
- Consumes: `getAdminDashboardSnapshot()` and Task 3 components.
- Produces: authenticated `/admin` operational dashboard with retained Melhor Envio utility access.

- [ ] **Step 1: Extend RED page-contract assertions**

Add assertions to `tests/admin-dashboard-ui.test.ts` requiring:

```ts
assert.match(page, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/)
assert.match(page, /requireAdminPageAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)
assert.match(page, /getAdminDashboardSnapshot\s*\(/)
assert.match(page, /DashboardPeriodCard/)
assert.match(page, /DashboardOperations/)
assert.match(page, /DashboardAttentionCenter/)
assert.match(page, /DashboardProductSales/)
assert.match(page, /Não foi possível carregar os indicadores agora/)
assert.match(page, /\/admin\/integrations\/melhor-envio/)
```

Also assert that `/admin/page.tsx` does not contain direct `fetch(`, direct Supabase URLs, `order_events`, or `order_attention_flags`; those responsibilities belong to the repository/RPC.

- [ ] **Step 2: Run page test RED**

```bash
node --experimental-strip-types --test tests/admin-dashboard-ui.test.ts
```

Expected: FAIL because `/admin` still only renders the integration link.

- [ ] **Step 3: Implement the protected page load**

Keep:

```ts
export const dynamic = "force-dynamic"
await requireAdminPageAccess({ touch: true })
```

Load the snapshot in a narrow `try/catch`:

```ts
let snapshot: AdminDashboardSnapshot | null = null
try {
  snapshot = await getAdminDashboardSnapshot()
} catch {
  snapshot = null
}
```

If null, render the normal `AdminShell` plus a visible bounded unavailable state:

`Não foi possível carregar os indicadores agora. Os dados não foram substituídos por zeros. Tente novamente em instantes.`

Do not expose exception text to the browser.

If valid, render the approved visual order:

1. Orders / Approved gross / Reversed period cards;
2. operations + financial risk;
3. Attention Center;
4. products sold this month;
5. smaller Melhor Envio integration utility card.

Money formatting stays server-side with `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`.

- [ ] **Step 4: Run dashboard and auth UI tests GREEN**

```bash
node --experimental-strip-types --test \
  tests/admin-dashboard-ui.test.ts \
  tests/admin-auth-ui.test.ts \
  tests/admin-sidebar-ui.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

```bash
npx pnpm@10 typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add app/admin/page.tsx tests/admin-dashboard-ui.test.ts
git commit -m "feat: turn admin home into operations dashboard"
```

---

### Task 5: Verify finance/time/attention semantics against executable SQL behavior

**Files:**
- Modify: `tests/admin-dashboard-migration.test.ts`
- Modify: `supabase/migrations/202609150001_dashboard_metrics_attention_center.sql` only if tests expose a defect.

**Interfaces:**
- Consumes: Task 1 RPC SQL.
- Produces: stronger regression proof for the exact business semantics approved in chat.

- [ ] **Step 1: Add semantic SQL contract assertions**

Strengthen the migration test to require:

- one captured `v_as_of` reused for boundaries;
- `date_trunc('week', ...)` and `date_trunc('month', ...)` in São Paulo local time;
- first approval/reversal CTEs order `created_at asc, id asc`;
- products join against current-month first approval time, not `orders.created_at`;
- attention bucket counts are based on one highest severity per order, not raw flag counts;
- top attention ordering uses severity rank descending and opening timestamp ascending;
- current `payment_status` counts include `manual_review`, `refunded`, and `charged_back`.

Use regex assertions tied to named CTEs rather than snapshotting the entire SQL file.

- [ ] **Step 2: Run the focused migration test**

```bash
node --experimental-strip-types --test tests/admin-dashboard-migration.test.ts
```

Expected: PASS. If RED, fix only the proven semantic mismatch and rerun until GREEN.

- [ ] **Step 3: Run all new Phase 8 tests together**

```bash
node --experimental-strip-types --test \
  tests/admin-dashboard-migration.test.ts \
  tests/admin-dashboard-repository.test.ts \
  tests/admin-dashboard-ui.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit semantic hardening if the task changed files**

```bash
git add tests/admin-dashboard-migration.test.ts supabase/migrations/202609150001_dashboard_metrics_attention_center.sql
git commit -m "test: harden dashboard metric semantics"
```

Skip this commit only when Step 1 required no file change after the assertions were already covered.

---

### Task 6: Update project checkpoint documentation after automated GREEN

**Files:**
- Modify: `docs/superpowers/CURRENT_STATUS.md`
- Modify: `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`
- Modify: `docs/PROJECT_MASTER_OVERVIEW.md`

**Interfaces:**
- Consumes: exact candidate SHA and test/CI evidence from Tasks 1–5.
- Produces: accurate Phase 8 implementation checkpoint without claiming hosted/Production acceptance prematurely.

- [ ] **Step 1: Run complete local verification before changing status docs**

```bash
npx pnpm@10 typecheck
NODE_ENV=production npx pnpm@10 build
npx pnpm@10 test
```

Expected: all commands exit 0.

- [ ] **Step 2: Update status wording conservatively**

Record Phase 8 as `IMPLEMENTATION COMPLETE / AUTOMATED GREEN` only after Step 1 passes. Explicitly state:

- hosted migration not yet applied until it actually is;
- Production not yet deployed/accepted until rollout actually occurs;
- Attention Center is read-only;
- financial metrics are DB-derived from trusted Mercado Pago events;
- Phase 9 remains not started.

Do not alter Phase 7 acceptance history.

- [ ] **Step 3: Commit docs checkpoint**

```bash
git add docs/PROJECT_MASTER_OVERVIEW.md docs/superpowers/CURRENT_STATUS.md docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md
git commit -m "docs: record Phase 8 implementation checkpoint"
```

---

### Task 7: Exact-SHA CI and hosted Supabase rollout

**Files:**
- No application file change unless validation finds a real defect.
- Later acceptance evidence may create `docs/superpowers/phase-8/FINAL_ACCEPTANCE.md`.

**Interfaces:**
- Consumes: exact branch candidate SHA from Task 6.
- Produces: hosted RPC applied once and reconciled with authoritative rows.

- [ ] **Step 1: Push/check exact candidate and wait for CI**

CI must pass the existing workflow including exact Node.js 22.x setup, frozen install, typecheck, Vercel build, route/startup checks, and full tests. Record run ID + SHA.

- [ ] **Step 2: Apply the Phase 8 migration once to hosted Supabase**

Apply only `supabase/migrations/202609150001_dashboard_metrics_attention_center.sql` through the project’s established Supabase migration workflow. Do not reapply Phase 7 `store_settings` or rewrite migration history.

- [ ] **Step 3: Run read-only hosted reconciliation**

Execute `select public.admin_get_dashboard_snapshot();` with privileged tooling and compare at least:

- current fulfillment status counts against direct `orders` grouped counts;
- attention totals against unresolved `order_attention_flags` grouped by order/highest severity;
- approved/reversed month values against trusted `order_events` + order totals;
- products month quantities against expanded `orders.items` for approved-month orders.

No synthetic order/payment/attention write fixture is needed.

- [ ] **Step 4: Check security properties**

Verify function owner/search path/grants and confirm browser roles cannot execute the RPC directly. Confirm no new security advisor regression requiring rollback.

- [ ] **Step 5: Record hosted checkpoint**

Update docs only with evidence actually observed. If hosted validation fails, stop rollout and fix forward with a new additive migration if database behavior needs correction.

---

### Task 8: Vercel deploy and Production acceptance

**Files:**
- Create after acceptance: `docs/superpowers/phase-8/FINAL_ACCEPTANCE.md`
- Modify after acceptance: `docs/superpowers/CURRENT_STATUS.md`
- Modify after acceptance: `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`
- Modify after acceptance: `docs/PROJECT_MASTER_OVERVIEW.md`

**Interfaces:**
- Consumes: exact CI-green candidate SHA and hosted-validated RPC.
- Produces: Production-accepted Phase 8 evidence; no automatic merge to `main` unless owner explicitly approves.

- [ ] **Step 1: Deploy the exact candidate using the existing Vercel runbook**

On Vercel:

```bash
cd <project-root>
git fetch origin
# check out the exact candidate/branch state according to the established deployment runbook
nvm use
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production npx pnpm@10 build
```

Use normal `umask 022`. Do not use PM2 CLI. Restart only through the Vercel dashboard.

- [ ] **Step 2: Public runtime smoke**

```bash
curl -sSI https://www.proxybembem.com.br/ | head -n 6
git rev-parse HEAD
git status -sb
```

Require HTTP 200 and the exact candidate SHA. Restore only known Next-generated `next-env.d.ts` drift after inspecting it; never discard unknown local changes.

- [ ] **Step 3: Authenticated dashboard acceptance**

In `/admin`, verify:

- Orders today/week/month match direct DB reconciliation;
- Approved gross uses approval time, including a known order created on a different day if available;
- Reversed value is separate from approved gross;
- Aguardando produção / Em produção / Pronto para envio / Enviados match current statuses;
- financial-risk counts are current statuses;
- Attention Center totals and top ordering match unresolved flags;
- each attention row opens the correct `/admin/pedidos/{id}`;
- “Ver todos” opens `/admin/pedidos?attention=1`;
- product month ranking matches approved order snapshots;
- no sensitive metadata/provider payload appears;
- simulated/read failure path is covered by automated test; do not break Production connectivity merely to test it manually.

- [ ] **Step 4: Write final acceptance evidence**

Create `docs/superpowers/phase-8/FINAL_ACCEPTANCE.md` recording exact runtime SHA, CI run, hosted migration identity, reconciliation evidence, HTTP smoke, owner browser acceptance, and any intentionally deferred items.

- [ ] **Step 5: Commit acceptance docs only after evidence exists**

```bash
git add docs/PROJECT_MASTER_OVERVIEW.md docs/superpowers/CURRENT_STATUS.md docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md docs/superpowers/phase-8/FINAL_ACCEPTANCE.md
git commit -m "docs: record Phase 8 production acceptance"
```

No runtime redeploy is required for a docs-only acceptance commit.

---

## Plan Self-Review

- Spec coverage: all approved rules are mapped to Tasks 1–8: trusted event timing, calendar periods, gross/reversal separation, product snapshots, read-only attention, current operations, fail-visible behavior, auth boundary, hosted rollout, Vercel acceptance.
- Placeholder scan: implementation tasks contain concrete interfaces, commands, tests, and acceptance behavior; no implementation step delegates behavior to an undefined future decision.
- Type consistency: the RPC, repository, components, and page all use the single `AdminDashboardSnapshot` contract defined in the spec and produced by `getAdminDashboardSnapshot()`.
- Scope: Phase 8 remains a single read-only dashboard/attention subsystem. Charts, accounting, provider actions, partial-refund accounting, and generic attention resolution stay out of scope.
