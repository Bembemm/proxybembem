# Phase 8 — Dashboard Metrics + Attention Center Design

Date: 2026-09-15
Status: Approved in chat
Branch: `feat/phase-8-dashboard-metrics-attention`
Base: `main` at `75c78437883627e241a9708c8d07a0988dc8c8b5`

## 1. Goal

Turn `/admin` into a reliable operational overview for ProxyBembem using only trustworthy persisted database state. The dashboard must answer quickly: how many orders were created, how much value was actually approved by Mercado Pago, how much was later reversed, what is currently in each fulfillment queue, which orders need attention, and which products sold in the current month.

Phase 8 must not introduce vanity analytics, browser-derived financial truth, synthetic counters, provider mutations, or a second analytics backend.

## 2. Chosen architecture

Use the existing modular-monolith architecture with a new read-only dashboard module:

- PostgreSQL/Supabase performs authoritative aggregation through one service-role-only RPC: `public.admin_get_dashboard_snapshot()`;
- Next.js server code calls that RPC with `cache: "no-store"`, validates the complete payload, and fails explicitly on invalid or unavailable data;
- `/admin` remains a protected force-dynamic Server Component guarded by `requireAdminPageAccess({ touch: true })`;
- the browser receives only the validated display model and never computes authoritative money, fulfillment, or attention state;
- existing `/admin/pedidos?attention=1` remains the full attention drill-down instead of introducing a parallel orders surface.

Rejected alternatives:

1. aggregating with many REST calls in Next.js — rejected because it duplicates database truth, increases round trips, and spreads financial rules into application code;
2. materialized analytics tables/jobs — rejected as unnecessary operational complexity at the current store scale and because delayed refresh would weaken the promise that the dashboard reflects persisted truth now.

## 3. Security and trust boundaries

The Phase 8 RPC is read-only, `SECURITY DEFINER`, and uses a fixed empty `search_path`. Execution is revoked from `public`, `anon`, and `authenticated` and granted only to `service_role`.

No new public endpoint is required. `/admin` keeps the existing owner UUID + valid Supabase session + AAL2/TOTP + active admin-session boundary.

No provider token, TOTP material, service key, raw shipment provider payload, notification provider payload, full CPF, or arbitrary attention metadata may be returned by the dashboard snapshot.

Phase 8 performs no writes to orders, payments, shipments, notifications, settings, attention flags, or audit logs.

## 4. Time semantics

All dashboard calendar boundaries use `America/Sao_Paulo`.

The RPC captures one `as_of` timestamp and derives every metric from that same instant:

- today: local 00:00 through `as_of`;
- this week: local Monday 00:00 through `as_of`;
- this month: local first day 00:00 through `as_of`.

The dashboard does not use rolling 24-hour, 7-day, or 30-day windows.

## 5. Order creation metrics

`ordersCreated` contains counts for today, week, and month based on `orders.created_at`.

These counts represent orders created, regardless of eventual payment outcome. They are operational order-volume metrics, not revenue metrics.

## 6. Approved gross value

`approvedGrossCents` contains today/week/month approved values.

The time of approval comes from the first trustworthy `order_events` row per order satisfying all of:

- `event_type = 'payment_status_changed'`;
- `source = 'mercadopago'`;
- `metadata ->> 'payment_status' = 'approved'`.

The amount counted is the server-authoritative order total `coalesce(orders.total_cents, orders.subtotal_cents)`. The approval flow already requires provider amount/currency validation before trusted approval, so the dashboard does not recalculate payment authority from browser or provider payloads.

An order created yesterday and approved today contributes to today’s approved gross value.

Repeated approval events must never double-count the order; the first trusted approval event is the metric boundary.

## 7. Reversed value

`reversedCents` contains today/week/month value later reversed by `refunded` or `charged_back`.

The reversal timestamp is the first trustworthy Mercado Pago payment-status event per order whose status is either `refunded` or `charged_back`. The amount counted is the same authoritative order total used for approved gross.

A later transition between reversal statuses must not reverse the same order twice. Approved gross history is never erased retroactively.

The dashboard therefore intentionally presents approved gross and reversed value as independent facts rather than presenting a fabricated net-revenue number.

Current financial-risk counts also expose the number of orders whose current payment status is `manual_review`, `refunded`, or `charged_back`.

## 8. Current fulfillment queues

`operations` reflects current persisted fulfillment state, not historical events:

- `awaitingProduction` — `fulfillment_status = 'awaiting_production'`;
- `inProduction` — `fulfillment_status = 'in_production'`;
- `readyToShip` — `fulfillment_status = 'ready_to_ship'`;
- `shipped` — `fulfillment_status = 'shipped'`.

`completed` is not folded into `shipped`; each status remains truthful to its current physical stage.

## 9. Attention Center

The Attention Center is read-only in Phase 8. There is no generic “dismiss”, “resolve”, or “ignore” action.

An alert disappears only when its owning business flow resolves the underlying `order_attention_flags` row.

The dashboard aggregates open flags (`resolved_at is null`) by order. Each order appears at most once in the top queue.

Severity ordering is:

1. `critical`;
2. `warning`;
3. `info`.

Within the same severity, the oldest unresolved problem comes first.

For an order with multiple open flags:

- dashboard severity is the highest open severity;
- `flagCount` reports how many open flags exist on that order;
- `primaryCode` and `primarySource` come from the oldest flag at the highest severity;
- `openedAt` is the opening timestamp of that primary flag.

The snapshot contains:

- total distinct orders requiring attention;
- distinct orders bucketed by highest severity (`critical`, `warning`, `info`), so the buckets sum to the total;
- at most five top attention items containing only `orderId`, `orderNumber`, `customerName`, `severity`, `flagCount`, `primaryCode`, `primarySource`, and `openedAt`.

The Next.js layer maps known internal codes to human-readable Portuguese labels. Unknown codes use a safe generic label and are never rendered together with raw metadata.

Each item links to `/admin/pedidos/{orderId}`. “Ver todos” links to `/admin/pedidos?attention=1`.

## 10. Products sold this month

Product quantities sold are based only on orders whose first trusted approval event occurred in the current calendar month.

Quantities are read from the immutable `orders.items` purchase snapshot. Later refund or chargeback does not erase the historical approved sale from this metric.

Rows are grouped by stable snapshot `productId`. Quantity is summed from snapshot `quantity`. The display title is taken from the most recent approved snapshot for that product within the month, avoiding a dependency on current catalog copy while keeping one line per stable product ID.

Results are ordered by quantity descending, then product ID for deterministic output. Phase 8 V1 returns the top 10 products.

## 11. Snapshot contract

`admin_get_dashboard_snapshot()` returns one JSON object with this logical contract:

```ts
interface AdminDashboardSnapshot {
  asOf: string
  timezone: "America/Sao_Paulo"
  ordersCreated: { today: number; week: number; month: number }
  approvedGrossCents: { today: number; week: number; month: number }
  reversedCents: { today: number; week: number; month: number }
  financialRisk: {
    manualReview: number
    refunded: number
    chargedBack: number
  }
  operations: {
    awaitingProduction: number
    inProduction: number
    readyToShip: number
    shipped: number
  }
  attention: {
    totalOrders: number
    criticalOrders: number
    warningOrders: number
    infoOrders: number
    topItems: Array<{
      orderId: string
      orderNumber: string
      customerName: string
      severity: "critical" | "warning" | "info"
      flagCount: number
      primaryCode: string
      primarySource: string
      openedAt: string
    }>
  }
  productsThisMonth: Array<{
    productId: number
    title: string
    quantity: number
  }>
}
```

All integer counters and cents values must be nonnegative safe integers. UUIDs, timestamps, severity values, strings, product IDs, and bounded arrays are validated by server code before rendering.

## 12. Dashboard UI

`/admin` becomes the operational overview while preserving the current `AdminShell` and admin navigation.

Visual order:

1. period summary cards for Orders, Approved gross, and Reversed, each showing today/week/month;
2. current operation cards: Aguardando produção, Em produção, Pronto para envio, Enviados;
3. compact current financial-risk counts for Em revisão, Reembolsados, and Chargebacks;
4. large “Requer atenção” block with severity totals, top five orders, direct order links, and “Ver todos”;
5. “Produtos vendidos no mês” ranked by approved quantity;
6. existing Melhor Envio integration link retained as a smaller utility block at the bottom.

The page must be useful on mobile and desktop and follow the existing slate/violet admin visual language rather than introducing a separate design system.

No charting dependency is introduced in V1.

## 13. Failure behavior

Dashboard data is “truth or visible failure”, never fabricated fallback numbers.

If the RPC request fails, times out, returns malformed JSON, or violates the TypeScript contract, `getAdminDashboardSnapshot()` throws a bounded storage error. `/admin` renders an explicit unavailable-state message for the dashboard content while keeping the protected AdminShell/navigation usable.

The implementation must not silently turn failed reads into zeros.

## 14. Testing

Phase 8 uses TDD and covers:

- SQL migration contract: `SECURITY DEFINER`, fixed `search_path`, service-role-only execute, São Paulo calendar boundaries, trustworthy event filters, first approval/reversal dedupe, current fulfillment counts, distinct-order attention buckets, severity ordering, snapshot-item product aggregation, deterministic limits;
- repository/parser: valid snapshot, malformed shape, negative/non-integer values, invalid UUID/timestamp/severity, oversized attention/products arrays, network failure, non-2xx response;
- UI contract: protected force-dynamic `/admin`, server-side snapshot load, all approved sections/copy, attention links, safe code-label mapping, no raw metadata rendering, explicit unavailable state;
- full existing regression suite, typecheck, Vercel build, startup smoke, and route contract checks.

## 15. Rollout

1. implement on `feat/phase-8-dashboard-metrics-attention`;
2. keep all changes additive and automated tests green;
3. run full CI on the exact candidate SHA;
4. apply the new migration once to hosted Supabase;
5. validate the hosted RPC with read-only reconciliation queries; no synthetic write fixture is required;
6. deploy the exact candidate to Vercel using the existing Node.js 22.x / pnpm 10 runbook;
7. restart only through the Vercel dashboard;
8. verify public HTTP smoke and authenticated `/admin` dashboard values against direct database reconciliation;
9. record Production acceptance before any integration decision for the feature branch.

## 16. Out of scope

- manual generic attention dismissal/resolution;
- charts, funnels, conversion analytics, traffic analytics, marketing analytics, or customer tracking pixels;
- net profit, tax accounting, COGS, margin, or bookkeeping;
- partial-refund accounting beyond the current persisted full reversal model;
- materialized analytics tables or scheduled aggregation jobs;
- provider API calls from the dashboard;
- any operation that purchases/cancels shipping labels, changes fulfillment, changes payment state, or sends notifications;
- new public/customer analytics surfaces.

## 17. Acceptance criteria

Phase 8 is accepted only when:

- every displayed metric can be reconciled to persisted authoritative data;
- calendar periods use `America/Sao_Paulo` and the same `as_of` instant;
- payment approval/reversal timing follows trusted Mercado Pago events, not order creation time;
- repeated events cannot double-count approved or reversed value;
- products sold use approved orders and immutable item snapshots;
- attention is read-only, distinct-order based, severity ordered, and links to the correct order;
- no sensitive metadata appears on the overview;
- unavailable/invalid data never becomes a false zero;
- existing auth/payment/fulfillment/shipping/notification behavior remains green;
- hosted migration, Production deploy, and manual reconciliation smoke are recorded against exact SHAs.
