# Admin Data + Audit Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compatibility-safe fulfillment, attention, order-event, and admin-audit foundations while extending the trusted Mercado Pago payment RPC to atomically advance newly approved orders into the production queue.

**Architecture:** Keep `orders` as the purchase/payment record and add one operational fulfillment field. Store lifecycle history, active attention conditions, and admin audit in dedicated tables. Preserve the existing Mercado Pago RPC as the single atomic payment mutation boundary; extend that RPC so approved payment can perform the one allowed automatic fulfillment transition and emit idempotent events/attention changes in the same database transaction.

**Tech Stack:** PostgreSQL/Supabase migrations + REST/RPC, Next.js 16.3.3, TypeScript 5.7.3, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`

**Master plan:** `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md` Phase 1

## Global Constraints

- Payment status remains Mercado Pago/provider-authoritative.
- The only normal automatic payment-to-fulfillment transition is trusted `approved` payment while fulfillment is `awaiting_payment`, producing `awaiting_production`.
- Refund/chargeback must not rewind physical fulfillment.
- Production start without trusted approved payment is rejected by later admin operations; this phase provides the shared state-machine rule.
- No generic arbitrary admin PATCH is introduced.
- `order_events` and `admin_audit_log` are append-oriented; normal service-role access cannot update/delete their rows.
- New schema must be compatible with currently deployed code before application code is deployed.
- Existing orders are backfilled conservatively and receive no fabricated historical events.
- Existing checkout/public order/admin-auth behavior must remain unchanged.
- Secrets/provider tokens must never enter event, attention, or audit metadata.

---

## File Structure

### Create

- `supabase/migrations/202609020001_admin_order_operations_foundation.sql` — additive fulfillment column, `order_events`, `order_attention_flags`, `admin_audit_log`, grants/RLS, and upgraded Mercado Pago RPC.
- `lib/server/fulfillment.ts` — stable fulfillment type, type guard, and explicit admin transition validation.
- `lib/server/order-events.ts` — service-role read/append interface for non-payment domain events; payment events remain written atomically inside the payment RPC.
- `lib/server/order-attention.ts` — service-role read/open/resolve interface for non-payment attention conditions; payment attention remains handled atomically inside the payment RPC.
- `lib/server/admin-audit.ts` — service-role append/list interface; no update/delete API.
- `tests/admin-order-foundation-migration.test.ts` — static migration/security/backfill/RPC guarantees.
- `tests/fulfillment.test.ts` — pure state-machine rules.
- `tests/order-events.test.ts` — REST contract and validation for order events.
- `tests/order-attention.test.ts` — REST contract and validation for attention operations.
- `tests/admin-audit.test.ts` — REST contract and validation for audit writes/reads.

### Modify

- `lib/server/orders.ts` — expose `fulfillment_status` on order records and parse the extended payment RPC result.
- `tests/orders-payment-rpc.test.ts` — require fulfillment result fields and preserve exact RPC input contract.
- `tests/orders.test.ts` — update fixtures/assertions that model the selected order columns after `fulfillment_status` is added.
- `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md` — mark Phase 1 checkpoints only after evidence exists.
- `docs/superpowers/CURRENT_STATUS.md` — concise continuation checkpoint at the end of the implementation session.

### Do not modify in this phase unless a failing regression proves it necessary

- `app/api/mercadopago/webhook/route.ts` — it already delegates to `applyMercadoPagoPaymentEvent`; the database RPC remains the atomic domain boundary.
- `lib/server/checkout-flow.ts` / `checkout-order.ts` — new orders receive the database default `awaiting_payment`; checkout authority does not change.
- `app/admin/...` — Phase 1 has no new operational UI.
- `data/products.ts` — catalog migration belongs to Phase 4.

---

## Interfaces locked by this plan

### `lib/server/fulfillment.ts`

```ts
export const FULFILLMENT_STATUSES = [
  "awaiting_payment",
  "awaiting_production",
  "in_production",
  "ready_to_ship",
  "shipped",
  "completed",
  "canceled",
] as const

export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number]

export function isFulfillmentStatus(value: unknown): value is FulfillmentStatus

export function allowedAdminFulfillmentTransitions(
  status: FulfillmentStatus,
): readonly FulfillmentStatus[]

export function assertAdminFulfillmentTransition(input: {
  paymentStatus: string
  from: FulfillmentStatus
  to: FulfillmentStatus
}): void
```

Admin transition matrix for this foundation:

- `awaiting_payment -> canceled`
- `awaiting_production -> in_production | canceled`
- `in_production -> ready_to_ship | canceled`
- `ready_to_ship -> shipped | canceled`
- `shipped -> completed`
- `completed ->` none
- `canceled ->` none

Additional rule: `awaiting_production -> in_production` requires `paymentStatus === "approved"`.

The automatic `awaiting_payment -> awaiting_production` transition is **not** an admin transition and therefore does not appear in the admin transition matrix.

### Extended `PaymentEventResult`

```ts
export interface PaymentEventResult {
  outcome: "updated" | "ignored" | "manual_review" | "not_found"
  order_number: string | null
  payment_status: string | null
  payment_id: string | null
  expected_cents: number | null
  received_cents: number
  fulfillment_status: FulfillmentStatus | null
  fulfillment_transitioned: boolean
}
```

### Event source/type validation

`order_events` application helpers accept:

```ts
export type OrderEventSource =
  | "system"
  | "mercadopago"
  | "admin"
  | "shipment"
  | "notification"
  | "customer"

export interface AppendOrderEventInput {
  orderId: string
  eventType: string
  source: OrderEventSource
  dedupeKey?: string
  metadata?: Record<string, unknown>
}
```

`eventType` and attention/audit action codes use lowercase snake-case identifiers matching `/^[a-z][a-z0-9_]{2,63}$/`.

---

### Task 1: Add failing migration tests for the operational schema

**Files:**
- Create: `tests/admin-order-foundation-migration.test.ts`
- Test target: `supabase/migrations/202609020001_admin_order_operations_foundation.sql`

**Interfaces:**
- Consumes: existing `public.orders`, `public.apply_mercadopago_payment_event(...)` from earlier migrations.
- Produces: executable expectations for the Phase 1 migration.

- [ ] **Step 1: Write the failing migration test file**

Use the existing migration-test style (`readFile`, lowercase SQL, regex assertions). The test must assert all of the following exact guarantees:

```ts
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609020001_admin_order_operations_foundation.sql",
  import.meta.url,
)

async function sql() {
  return (await readFile(MIGRATION, "utf8")).toLowerCase()
}

test("adds compatibility-safe fulfillment and backfills without fabricated history", async () => {
  const text = await sql()
  assert.match(text, /add\s+column\s+if\s+not\s+exists\s+fulfillment_status\s+text/)
  assert.match(text, /payment_status\s*=\s*'approved'[\s\S]*?'awaiting_production'/)
  assert.match(text, /else\s+'awaiting_payment'/)
  assert.match(text, /alter\s+column\s+fulfillment_status\s+set\s+default\s+'awaiting_payment'/)
  assert.match(text, /orders_fulfillment_status_allowed/)
  assert.doesNotMatch(text, /insert\s+into\s+public\.order_events[\s\S]*?created_at[\s\S]*?select[\s\S]*?orders/)
})

test("creates backend-only event attention and audit tables", async () => {
  const text = await sql()
  for (const table of ["order_events", "order_attention_flags", "admin_audit_log"]) {
    assert.match(text, new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}`))
    assert.match(text, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`))
    assert.match(
      text,
      new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`),
    )
  }

  assert.match(text, /grant\s+select\s*,\s*insert\s+on\s+table\s+public\.order_events\s+to\s+service_role/)
  assert.match(text, /grant\s+select\s*,\s*insert\s+on\s+table\s+public\.admin_audit_log\s+to\s+service_role/)
  assert.match(text, /grant\s+select\s*,\s*insert\s*,\s*update\s+on\s+table\s+public\.order_attention_flags\s+to\s+service_role/)
})

test("upgraded payment RPC owns approved fulfillment transition and idempotent event side effects", async () => {
  const text = await sql()
  const start = text.indexOf("function public.apply_mercadopago_payment_event")
  assert.ok(start >= 0)
  const block = text.slice(start)
  assert.match(block, /for\s+update/)
  assert.match(block, /fulfillment_status\s*=\s*'awaiting_production'/)
  assert.match(block, /fulfillment_status\s*=\s*'awaiting_payment'/)
  assert.match(block, /insert\s+into\s+public\.order_events/)
  assert.match(block, /on\s+conflict\s*\(\s*dedupe_key\s*\)\s+do\s+nothing/)
  assert.match(block, /payment_manual_review/)
  assert.match(block, /payment_refunded/)
  assert.match(block, /payment_charged_back/)
  assert.match(block, /'fulfillment_transitioned'/)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm test -- tests/admin-order-foundation-migration.test.ts
```

Because the repository script expands `tests/*.test.ts`, if the script ignores the extra argument, use:

```bash
node --experimental-strip-types --test tests/admin-order-foundation-migration.test.ts
```

Expected: FAIL because `202609020001_admin_order_operations_foundation.sql` does not exist.

- [ ] **Step 3: Commit only if the RED test is captured in the working branch workflow**

Do not mark the task complete yet. The RED evidence must be recorded in the Master Plan checkpoint before implementation begins.

---

### Task 2: Implement additive schema, append-only tables, and the upgraded atomic payment RPC

**Files:**
- Create: `supabase/migrations/202609020001_admin_order_operations_foundation.sql`
- Test: `tests/admin-order-foundation-migration.test.ts`

**Interfaces:**
- Consumes: current `public.orders` schema and current payment RPC inputs.
- Produces: `orders.fulfillment_status`, `order_events`, `order_attention_flags`, `admin_audit_log`, and an extended JSON response from the existing payment RPC.

- [ ] **Step 1: Add the fulfillment column and conservative backfill**

Write the migration with this ordering so it is safe before new application code exists:

```sql
alter table public.orders
  add column if not exists fulfillment_status text;

update public.orders
set fulfillment_status = case
  when payment_status = 'approved' then 'awaiting_production'
  else 'awaiting_payment'
end
where fulfillment_status is null;

alter table public.orders
  alter column fulfillment_status set default 'awaiting_payment';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_fulfillment_status_allowed'
  ) then
    alter table public.orders
      add constraint orders_fulfillment_status_allowed
      check (fulfillment_status is null or fulfillment_status in (
        'awaiting_payment',
        'awaiting_production',
        'in_production',
        'ready_to_ship',
        'shipped',
        'completed',
        'canceled'
      ));
  end if;
end;
$$;

create index if not exists orders_fulfillment_status_idx
  on public.orders (fulfillment_status, created_at desc);
```

Do **not** set `NOT NULL` in this first compatibility migration. Existing rows are backfilled and new rows get the default; hardening can occur after rollout evidence.

- [ ] **Step 2: Create `order_events`**

```sql
create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{2,63}$'),
  source text not null check (source in (
    'system', 'mercadopago', 'admin', 'shipment', 'notification', 'customer'
  )),
  dedupe_key text unique,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_created_idx
  on public.order_events (order_id, created_at desc);

alter table public.order_events enable row level security;
revoke all on table public.order_events from public, anon, authenticated;
grant select, insert on table public.order_events to service_role;
```

Do not grant update/delete to `service_role`.

- [ ] **Step 3: Create `order_attention_flags`**

```sql
create table if not exists public.order_attention_flags (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  code text not null check (code ~ '^[a-z][a-z0-9_]{2,63}$'),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  source text not null check (source in (
    'system', 'mercadopago', 'admin', 'shipment', 'notification', 'customer'
  )),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (resolved_at is null or resolved_at >= opened_at)
);

create unique index if not exists order_attention_active_code_uidx
  on public.order_attention_flags (order_id, code)
  where resolved_at is null;

create index if not exists order_attention_open_idx
  on public.order_attention_flags (order_id, severity, opened_at desc)
  where resolved_at is null;

alter table public.order_attention_flags enable row level security;
revoke all on table public.order_attention_flags from public, anon, authenticated;
grant select, insert, update on table public.order_attention_flags to service_role;
```

No delete grant is added.

- [ ] **Step 4: Create `admin_audit_log`**

```sql
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null,
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_]{2,63}$'),
  entity_id text not null check (length(entity_id) between 1 and 128),
  action text not null check (action ~ '^[a-z][a-z0-9_]{2,63}$'),
  previous_values jsonb check (
    previous_values is null or jsonb_typeof(previous_values) = 'object'
  ),
  new_values jsonb check (
    new_values is null or jsonb_typeof(new_values) = 'object'
  ),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_entity_created_idx
  on public.admin_audit_log (entity_type, entity_id, created_at desc);

create index if not exists admin_audit_admin_created_idx
  on public.admin_audit_log (admin_user_id, created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from public, anon, authenticated;
grant select, insert on table public.admin_audit_log to service_role;
```

- [ ] **Step 5: Replace the payment RPC while preserving all existing financial guards**

Keep the function name and input signature exactly unchanged so deployed code can call the upgraded database before the TypeScript deployment changes.

The implementation must retain the existing rules:

```text
unknown order -> not_found
approved + different payment id -> ignored
approved + repeated approved same id -> ignored
approved + same payment id + refunded/charged_back -> update reversal
refunded/charged_back + different payment or non-reversal -> ignored
approved incoming amount/currency mismatch -> manual_review
all other allowed incoming states -> update
```

After the financial decision, apply these side effects in the **same RPC transaction**:

```sql
-- payment event; unique dedupe_key makes repeated provider events idempotent
insert into public.order_events (
  order_id, event_type, source, dedupe_key, metadata
)
values (
  v_order.id,
  'payment_status_changed',
  'mercadopago',
  'mercadopago:' || p_payment_id || ':' || v_order.payment_status,
  jsonb_build_object(
    'payment_id', p_payment_id,
    'payment_status', v_order.payment_status,
    'status_detail', p_status_detail,
    'expected_cents', v_expected_cents,
    'received_cents', p_paid_cents,
    'currency_id', p_currency_id
  )
)
on conflict (dedupe_key) do nothing;
```

When the resulting payment is `approved`, resolve a previous manual-review flag and perform the one automatic fulfillment transition only if still awaiting payment:

```sql
update public.order_attention_flags
set resolved_at = coalesce(resolved_at, now())
where order_id = v_order.id
  and code = 'payment_manual_review'
  and resolved_at is null;

if v_order.fulfillment_status = 'awaiting_payment' then
  update public.orders
  set fulfillment_status = 'awaiting_production'
  where id = v_order.id
  returning * into v_order;

  v_fulfillment_transitioned := true;

  insert into public.order_events (
    order_id, event_type, source, dedupe_key, metadata
  )
  values (
    v_order.id,
    'fulfillment_status_changed',
    'system',
    'payment-approved-fulfillment:' || v_order.id::text,
    jsonb_build_object(
      'from', 'awaiting_payment',
      'to', 'awaiting_production',
      'reason', 'payment_approved'
    )
  )
  on conflict (dedupe_key) do nothing;
end if;
```

For `manual_review`, open one active critical flag:

```sql
insert into public.order_attention_flags (
  order_id, code, severity, source, metadata
)
values (
  v_order.id,
  'payment_manual_review',
  'critical',
  'mercadopago',
  jsonb_build_object(
    'payment_id', p_payment_id,
    'expected_cents', v_expected_cents,
    'received_cents', p_paid_cents,
    'currency_id', p_currency_id
  )
)
on conflict do nothing;
```

For `refunded` and `charged_back`, resolve the other active reversal flag and open the matching critical flag. Use codes exactly `payment_refunded` and `payment_charged_back`. Do not alter `fulfillment_status`.

Every RPC return path must include:

```sql
'fulfillment_status', v_order.fulfillment_status,
'fulfillment_transitioned', v_fulfillment_transitioned
```

For `not_found`, return `fulfillment_status = null` and `fulfillment_transitioned = false`.

The function remains `security definer`, `set search_path = ''`, revoked from `public, anon, authenticated`, and executable only by `service_role` exactly as the current payment RPC is protected.

- [ ] **Step 6: Run the migration test and verify GREEN**

Run:

```bash
node --experimental-strip-types --test tests/admin-order-foundation-migration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the schema/RPC change**

```bash
git add supabase/migrations/202609020001_admin_order_operations_foundation.sql tests/admin-order-foundation-migration.test.ts
git commit -m "feat: add admin order data foundation"
```

Record RED and GREEN evidence plus commit SHA in the Master Plan.

---

### Task 3: Add the fulfillment state-machine module

**Files:**
- Create: `lib/server/fulfillment.ts`
- Create: `tests/fulfillment.test.ts`

**Interfaces:**
- Produces the exact `FulfillmentStatus`, `isFulfillmentStatus`, `allowedAdminFulfillmentTransitions`, and `assertAdminFulfillmentTransition` interfaces declared above.
- Later Phase 2 admin operations must consume this module rather than duplicating transition rules in route components.

- [ ] **Step 1: Write failing state-machine tests**

```ts
import assert from "node:assert/strict"
import test from "node:test"
import {
  allowedAdminFulfillmentTransitions,
  assertAdminFulfillmentTransition,
  isFulfillmentStatus,
} from "../lib/server/fulfillment.ts"

test("recognizes only the approved fulfillment vocabulary", () => {
  assert.equal(isFulfillmentStatus("awaiting_payment"), true)
  assert.equal(isFulfillmentStatus("awaiting_production"), true)
  assert.equal(isFulfillmentStatus("in_production"), true)
  assert.equal(isFulfillmentStatus("ready_to_ship"), true)
  assert.equal(isFulfillmentStatus("shipped"), true)
  assert.equal(isFulfillmentStatus("completed"), true)
  assert.equal(isFulfillmentStatus("canceled"), true)
  assert.equal(isFulfillmentStatus("problem"), false)
  assert.equal(isFulfillmentStatus(null), false)
})

test("keeps the payment-approved automatic transition out of admin controls", () => {
  assert.deepEqual(allowedAdminFulfillmentTransitions("awaiting_payment"), ["canceled"])
})

test("allows only the approved admin transition matrix", () => {
  assert.deepEqual(allowedAdminFulfillmentTransitions("awaiting_production"), ["in_production", "canceled"])
  assert.deepEqual(allowedAdminFulfillmentTransitions("in_production"), ["ready_to_ship", "canceled"])
  assert.deepEqual(allowedAdminFulfillmentTransitions("ready_to_ship"), ["shipped", "canceled"])
  assert.deepEqual(allowedAdminFulfillmentTransitions("shipped"), ["completed"])
  assert.deepEqual(allowedAdminFulfillmentTransitions("completed"), [])
  assert.deepEqual(allowedAdminFulfillmentTransitions("canceled"), [])
})

test("rejects production start without approved payment", () => {
  assert.throws(
    () => assertAdminFulfillmentTransition({
      paymentStatus: "pending",
      from: "awaiting_production",
      to: "in_production",
    }),
    /approved payment required/,
  )
})

test("rejects impossible jumps even when payment is approved", () => {
  assert.throws(
    () => assertAdminFulfillmentTransition({
      paymentStatus: "approved",
      from: "awaiting_production",
      to: "shipped",
    }),
    /invalid fulfillment transition/,
  )
})
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --experimental-strip-types --test tests/fulfillment.test.ts
```

Expected: FAIL because `lib/server/fulfillment.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure state machine**

```ts
export const FULFILLMENT_STATUSES = [
  "awaiting_payment",
  "awaiting_production",
  "in_production",
  "ready_to_ship",
  "shipped",
  "completed",
  "canceled",
] as const

export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number]

const STATUS_SET = new Set<string>(FULFILLMENT_STATUSES)

const ADMIN_TRANSITIONS: Readonly<Record<FulfillmentStatus, readonly FulfillmentStatus[]>> = {
  awaiting_payment: ["canceled"],
  awaiting_production: ["in_production", "canceled"],
  in_production: ["ready_to_ship", "canceled"],
  ready_to_ship: ["shipped", "canceled"],
  shipped: ["completed"],
  completed: [],
  canceled: [],
}

export function isFulfillmentStatus(value: unknown): value is FulfillmentStatus {
  return typeof value === "string" && STATUS_SET.has(value)
}

export function allowedAdminFulfillmentTransitions(
  status: FulfillmentStatus,
): readonly FulfillmentStatus[] {
  return ADMIN_TRANSITIONS[status]
}

export function assertAdminFulfillmentTransition(input: {
  paymentStatus: string
  from: FulfillmentStatus
  to: FulfillmentStatus
}) {
  if (!ADMIN_TRANSITIONS[input.from].includes(input.to)) {
    throw new Error("invalid fulfillment transition")
  }

  if (
    input.from === "awaiting_production" &&
    input.to === "in_production" &&
    input.paymentStatus !== "approved"
  ) {
    throw new Error("approved payment required")
  }
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
node --experimental-strip-types --test tests/fulfillment.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/fulfillment.ts tests/fulfillment.test.ts
git commit -m "feat: define fulfillment transition rules"
```

---

### Task 4: Extend the order repository/payment RPC TypeScript contract

**Files:**
- Modify: `lib/server/orders.ts`
- Modify: `tests/orders-payment-rpc.test.ts`
- Modify: `tests/orders.test.ts`
- Consume: `lib/server/fulfillment.ts`

**Interfaces:**
- `OrderRecord.fulfillment_status: FulfillmentStatus`
- Extended `PaymentEventResult` declared above.

- [ ] **Step 1: Update the payment RPC test first**

Change the mocked successful RPC response and expected result in `tests/orders-payment-rpc.test.ts` to include:

```ts
fulfillment_status: "awaiting_production",
fulfillment_transitioned: true,
```

Add a malformed-response case that returns:

```ts
{
  outcome: "updated",
  order_number: "PB-A1B2C3D4E5F6",
  payment_status: "approved",
  payment_id: "175133542535",
  expected_cents: 13832,
  received_cents: 13832,
  fulfillment_status: "made_up_status",
  fulfillment_transitioned: true,
}
```

and assert `applyMercadoPagoPaymentEvent` rejects it.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --experimental-strip-types --test tests/orders-payment-rpc.test.ts
```

Expected: FAIL because current parser/result does not return the new fulfillment fields.

- [ ] **Step 3: Update `orders.ts`**

Import:

```ts
import {
  isFulfillmentStatus,
  type FulfillmentStatus,
} from "./fulfillment.ts"
```

Add to `OrderRecord`:

```ts
fulfillment_status: FulfillmentStatus
```

Add `"fulfillment_status"` to `ORDER_SELECT` immediately before timestamps or another stable documented position.

Replace `PaymentEventResult` with the extended interface from this plan.

Extend RPC response validation:

```ts
const fulfillmentStatus = result.fulfillment_status
if (
  fulfillmentStatus !== null &&
  !isFulfillmentStatus(fulfillmentStatus)
) {
  throw new Error("Payment event RPC returned an invalid response")
}

if (typeof result.fulfillment_transitioned !== "boolean") {
  throw new Error("Payment event RPC returned an invalid response")
}
```

Keep the exact existing RPC input body unchanged.

- [ ] **Step 4: Update order repository fixtures**

Where `tests/orders.test.ts` asserts selected/returned order records, add a valid `fulfillment_status`, normally `"awaiting_payment"` for newly created pending orders.

Do not change checkout input to accept a fulfillment status from the browser.

- [ ] **Step 5: Run focused tests**

```bash
node --experimental-strip-types --test tests/orders-payment-rpc.test.ts tests/orders.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/server/orders.ts tests/orders-payment-rpc.test.ts tests/orders.test.ts
git commit -m "feat: expose fulfillment on order payments"
```

---

### Task 5: Add focused order event and attention repositories

**Files:**
- Create: `lib/server/order-events.ts`
- Create: `lib/server/order-attention.ts`
- Create: `tests/order-events.test.ts`
- Create: `tests/order-attention.test.ts`

**Interfaces:**

```ts
export interface OrderEventRecord {
  id: string
  order_id: string
  event_type: string
  source: OrderEventSource
  dedupe_key: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export async function appendOrderEvent(
  input: AppendOrderEventInput,
): Promise<OrderEventRecord | null>

export async function listOrderEvents(
  orderId: string,
  limit?: number,
): Promise<OrderEventRecord[]>
```

`appendOrderEvent` returns `null` when a supplied `dedupeKey` already exists (PostgREST representation is empty after conflict-ignore behavior). It is for later non-payment domain events; it must not replace the atomic payment RPC.

Attention interface:

```ts
export type AttentionSeverity = "info" | "warning" | "critical"

export interface OrderAttentionRecord {
  id: string
  order_id: string
  code: string
  severity: AttentionSeverity
  source: OrderEventSource
  metadata: Record<string, unknown>
  opened_at: string
  resolved_at: string | null
}

export async function openOrderAttention(input: {
  orderId: string
  code: string
  severity: AttentionSeverity
  source: OrderEventSource
  metadata?: Record<string, unknown>
}): Promise<OrderAttentionRecord | null>

export async function resolveOrderAttention(input: {
  orderId: string
  code: string
}): Promise<OrderAttentionRecord | null>

export async function listOpenOrderAttention(
  orderId: string,
): Promise<OrderAttentionRecord[]>
```

- [ ] **Step 1: Write REST-contract tests before implementation**

Mock `globalThis.fetch` using the same Supabase environment pattern as `tests/orders-payment-rpc.test.ts`.

For `appendOrderEvent`, assert:

```text
POST /rest/v1/order_events?select=...
Prefer includes return=representation and resolution=ignore-duplicates when dedupeKey exists
body maps camelCase -> order_id/event_type/source/dedupe_key/metadata
```

For `listOrderEvents`, assert query contains:

```text
order_id=eq.<uuid>
order=created_at.desc
limit=<bounded limit>
```

For attention open/resolve/list, assert only `order_attention_flags` is used and resolve PATCH contains only `resolved_at` plus filters for `order_id`, `code`, and `resolved_at=is.null`.

Also test validation rejects malformed UUIDs, invalid snake-case codes, unsupported source/severity, non-object metadata, and unreasonable list limits.

- [ ] **Step 2: Verify RED**

```bash
node --experimental-strip-types --test tests/order-events.test.ts tests/order-attention.test.ts
```

Expected: FAIL because repository modules do not exist.

- [ ] **Step 3: Implement strict input validation and server-only REST calls**

Use `getSupabaseEnv()` and the existing server request style. Validate UUID with:

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CODE_RE = /^[a-z][a-z0-9_]{2,63}$/
```

Bound event list limit to `1..200`, default `100`.

Use `cache: "no-store"` and a 10-second timeout like current server repositories.

Do not log event metadata or response bodies on failures. Log only table/operation/status.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
node --experimental-strip-types --test tests/order-events.test.ts tests/order-attention.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/order-events.ts lib/server/order-attention.ts tests/order-events.test.ts tests/order-attention.test.ts
git commit -m "feat: add order event attention repositories"
```

---

### Task 6: Add append-only admin audit repository

**Files:**
- Create: `lib/server/admin-audit.ts`
- Create: `tests/admin-audit.test.ts`

**Interfaces:**

```ts
export interface AdminAuditRecord {
  id: string
  admin_user_id: string
  entity_type: string
  entity_id: string
  action: string
  previous_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  metadata: Record<string, unknown>
  created_at: string
}

export async function appendAdminAudit(input: {
  adminUserId: string
  entityType: string
  entityId: string
  action: string
  previousValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
}): Promise<AdminAuditRecord>

export async function listAdminAuditForEntity(input: {
  entityType: string
  entityId: string
  limit?: number
}): Promise<AdminAuditRecord[]>
```

This module intentionally has **no update/delete function**.

- [ ] **Step 1: Write failing tests**

Tests must prove:

- append POSTs to `admin_audit_log` with `Prefer: return=representation`;
- list filters by exact entity type/id and sorts newest-first;
- invalid admin UUID/code/entity ID/metadata fails before fetch;
- no exported function name contains `updateAdminAudit` or `deleteAdminAudit`.

Example export-surface assertion:

```ts
const audit = await import("../lib/server/admin-audit.ts")
assert.equal("updateAdminAudit" in audit, false)
assert.equal("deleteAdminAudit" in audit, false)
```

- [ ] **Step 2: Verify RED**

```bash
node --experimental-strip-types --test tests/admin-audit.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement append/list only**

Use the same UUID/code/object validation from the new event modules. Bound list limit to `1..200`, default `100`. Never accept/record password, TOTP, provider-token, auth-cookie, or raw credential fields; callers must provide already-sanitized metadata and the function should reject top-level keys matching this denylist:

```ts
const FORBIDDEN_KEYS = new Set([
  "password",
  "password_hash",
  "totp_secret",
  "access_token",
  "refresh_token",
  "authorization",
  "cookie",
  "secret",
])
```

Check `previousValues`, `newValues`, and `metadata` top-level keys before POST.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
node --experimental-strip-types --test tests/admin-audit.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/admin-audit.ts tests/admin-audit.test.ts
git commit -m "feat: add append-only admin audit repository"
```

---

### Task 7: Run Phase 1 regression verification

**Files:**
- Potentially modify only tests/implementation files already in this plan if regression failures reveal a Phase 1 defect.
- Modify: `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`
- Modify: `docs/superpowers/CURRENT_STATUS.md`

**Interfaces:**
- Verifies Phase 1 as a coherent candidate before Preview/Supabase application.

- [ ] **Step 1: Run all Phase 1 focused tests together**

```bash
node --experimental-strip-types --test \
  tests/admin-order-foundation-migration.test.ts \
  tests/fulfillment.test.ts \
  tests/orders-payment-rpc.test.ts \
  tests/orders.test.ts \
  tests/order-events.test.ts \
  tests/order-attention.test.ts \
  tests/admin-audit.test.ts
```

Expected: all PASS, zero failures.

- [ ] **Step 2: Run the complete repository test suite**

```bash
pnpm test
```

Expected: PASS with zero failing tests.

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: exit 0.

- [ ] **Step 4: Run production build**

```bash
pnpm build
```

Expected: exit 0 in GitHub CI/Linux. Do not substitute a known Android/Termux native-SWC limitation for CI evidence.

- [ ] **Step 5: Review exact diff against Phase 1 scope**

Confirm the candidate contains only:

```text
one additive Phase 1 migration
fulfillment pure module
orders payment-result contract update
event/attention/audit repositories
Phase 1 tests
documentation checkpoints
```

Reject unrelated storefront/catalog/hosting/refactor changes.

- [ ] **Step 6: Commit checkpoint documentation**

Update Master Plan Phase 1 with exact RED/GREEN evidence and last verified commit. Update `CURRENT_STATUS.md` with Phase 1 state and exact next action.

```bash
git add docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md docs/superpowers/CURRENT_STATUS.md
git commit -m "docs: checkpoint admin data foundation"
```

---

### Task 8: Apply and validate the additive migration in a non-Production environment

**Files:**
- No new application files unless validation exposes a defect.
- Update checkpoint docs with environment evidence.

**Interfaces:**
- Database migration must be safe before application code deployment.

- [ ] **Step 1: Re-read the exact migration commit before applying**

Confirm it does not set `fulfillment_status NOT NULL`, delete existing data, drop checkout/payment columns, or fabricate historical events.

- [ ] **Step 2: Apply `202609020001_admin_order_operations_foundation.sql` to the intended Preview/Sandbox Supabase environment**

Record only migration name, success/failure, and environment label. Never record credentials.

- [ ] **Step 3: Validate backfill with aggregate/safe queries**

Verify:

```text
existing approved orders -> awaiting_production
existing non-approved orders -> awaiting_payment
new order insert that omits fulfillment_status -> awaiting_payment
no retroactive order_events were created by backfill
browser roles cannot read/write event/audit/attention tables
service-role privileges match the migration grants
```

Do not paste customer PII into chat/docs while verifying.

- [ ] **Step 4: Validate the upgraded payment RPC with controlled Sandbox fixtures**

Prove:

```text
pending + trusted approved exact amount -> approved + awaiting_production + fulfillment_transitioned=true
repeated approved same payment -> ignored + no duplicate order event
approved -> refunded -> fulfillment unchanged + payment_refunded attention
approved -> charged_back -> fulfillment unchanged + payment_charged_back attention
amount/currency mismatch -> manual_review + payment_manual_review attention
```

- [ ] **Step 5: Deploy the Phase 1 code candidate to Preview only after migration success**

Verify existing checkout/public order/admin auth smoke paths. No new admin UI is expected in Phase 1.

- [ ] **Step 6: Review Preview runtime logs for new database/RPC errors**

Record whether error/fatal logs contain Phase 1 failures. Never log/request tokens or PII.

- [ ] **Step 7: Obtain explicit owner approval before any Production migration/deploy**

Do not apply this migration to Production or merge the branch merely because Sandbox/Preview passed.

---

## Phase 1 Completion Gate

Phase 1 may be marked `[x]` in the Master Plan only when all of these are true:

- migration tests show the additive/backfill/security/RPC contract;
- state-machine tests pass;
- order repository/payment parser tests pass;
- event/attention/audit repository tests pass;
- full `pnpm test`, `pnpm typecheck`, and `pnpm build` pass on the exact candidate;
- non-Production migration/RPC validation succeeds;
- Preview smoke checks show no checkout/public-order/admin-auth regression;
- checkpoint docs record exact evidence;
- Production remains unmodified unless the owner separately authorizes it.

**Next phase after acceptance:** write/review `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md` before building `/admin/pedidos`, `/admin/pedidos/[id]`, or `/admin/producao`.
