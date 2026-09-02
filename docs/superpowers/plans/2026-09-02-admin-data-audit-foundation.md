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
- Refund/chargeback never rewinds physical fulfillment.
- No generic arbitrary admin PATCH is introduced.
- `order_events` and `admin_audit_log` are append-oriented; normal `service_role` access cannot update/delete their rows.
- New schema must be safe to apply before new application code is deployed.
- Existing orders are backfilled conservatively and receive no fabricated historical events.
- Existing checkout/public-order/admin-auth behavior remains unchanged.
- Secrets/provider tokens never enter event, attention, or audit metadata.
- Production remains unchanged until explicit owner approval at the later rollout gate.

---

## File Structure

### Create

- `supabase/migrations/202609020001_admin_order_operations_foundation.sql` — additive fulfillment column, `order_events`, `order_attention_flags`, `admin_audit_log`, grants/RLS, and upgraded Mercado Pago RPC.
- `lib/server/fulfillment.ts` — stable fulfillment vocabulary and admin transition rules.
- `lib/server/safe-metadata.ts` — bounded recursive metadata validator that rejects secret-like/internal keys.
- `lib/server/order-events.ts` — read/append interface for non-payment domain events.
- `lib/server/order-attention.ts` — read/open/resolve interface for non-payment attention conditions.
- `lib/server/admin-audit.ts` — append/list interface; intentionally no update/delete API.
- `tests/admin-order-foundation-migration.test.ts`
- `tests/fulfillment.test.ts`
- `tests/safe-metadata.test.ts`
- `tests/order-events.test.ts`
- `tests/order-attention.test.ts`
- `tests/admin-audit.test.ts`

### Modify

- `lib/server/orders.ts` — expose `fulfillment_status` and parse the extended payment RPC result.
- `tests/orders-payment-rpc.test.ts` — require extended RPC response fields.
- `tests/orders.test.ts` — update order fixtures/select expectations.
- `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md` — record RED/GREEN/verification evidence.
- `docs/superpowers/CURRENT_STATUS.md` — concise continuation checkpoint.

### Do not modify in Phase 1 unless a failing regression proves it necessary

- `app/api/mercadopago/webhook/route.ts` — it already delegates to `applyMercadoPagoPaymentEvent`; the RPC remains the atomic domain boundary.
- `lib/server/checkout-flow.ts` and `lib/server/checkout-order.ts` — new orders receive the database default `awaiting_payment`; checkout authority does not change.
- `app/admin/...` — operational UI starts in Phase 2.
- `data/products.ts` — catalog migration starts in Phase 4.

---

## Interfaces Locked by This Plan

### Fulfillment

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

Admin matrix:

- `awaiting_payment -> canceled`
- `awaiting_production -> in_production | canceled`
- `in_production -> ready_to_ship | canceled`
- `ready_to_ship -> shipped | canceled`
- `shipped -> completed`
- `completed ->` none
- `canceled ->` none

`awaiting_production -> in_production` additionally requires `paymentStatus === "approved"`.

The automatic `awaiting_payment -> awaiting_production` transition is provider-driven and is not an admin transition.

### Payment RPC result

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

### Shared metadata safety

```ts
export function assertSafeMetadata(
  value: Record<string, unknown> | null | undefined,
  fieldName: string,
): void
```

Rules:

- object/arrays are traversed recursively to depth 8;
- serialized payload must be <= 16 KiB;
- reject any key, case-insensitively, containing `password`, `secret`, `token`, `authorization`, `cookie`, `fingerprint`, or `checkout_url`;
- reject non-JSON values such as functions, symbols, bigint, `undefined` nested inside arrays/objects, and non-finite numbers;
- fixed payment-RPC metadata is not caller-controlled and remains defined directly in SQL.

### Order events

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

Codes use `/^[a-z][a-z0-9_]{2,63}$/`.

---

### Task 1: Write RED migration tests

**Files:**
- Create: `tests/admin-order-foundation-migration.test.ts`

**Produces:** executable requirements for the additive schema and upgraded RPC.

- [ ] **Step 1: Create the failing migration test**

Use the repository's existing migration-test style. Include these assertions:

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

test("adds compatibility-safe fulfillment and conservative backfill", async () => {
  const text = await sql()
  assert.match(text, /add\s+column\s+if\s+not\s+exists\s+fulfillment_status\s+text/)
  assert.match(text, /payment_status\s*=\s*'approved'[\s\S]*?'awaiting_production'/)
  assert.match(text, /else\s+'awaiting_payment'/)
  assert.match(text, /alter\s+column\s+fulfillment_status\s+set\s+default\s+'awaiting_payment'/)
  assert.match(text, /orders_fulfillment_status_allowed/)
  assert.doesNotMatch(text, /alter\s+column\s+fulfillment_status\s+set\s+not\s+null/)
})

test("creates backend-only operational history tables", async () => {
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

test("upgraded payment RPC owns automatic fulfillment and payment attention", async () => {
  const text = await sql()
  const start = text.indexOf("function public.apply_mercadopago_payment_event")
  assert.ok(start >= 0)
  const block = text.slice(start)
  assert.match(block, /for\s+update/)
  assert.match(block, /fulfillment_status\s*=\s*'awaiting_production'/)
  assert.match(block, /insert\s+into\s+public\.order_events/)
  assert.match(block, /on\s+conflict\s*\(\s*dedupe_key\s*\)\s+do\s+nothing/)
  assert.match(block, /payment_manual_review/)
  assert.match(block, /payment_refunded/)
  assert.match(block, /payment_charged_back/)
  assert.match(block, /'fulfillment_transitioned'/)
})
```

- [ ] **Step 2: Run only this test and capture RED**

```bash
node --experimental-strip-types --test tests/admin-order-foundation-migration.test.ts
```

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Record RED evidence in the Master Plan checkpoint before implementation**

Do not mark Task 1 complete until the exact failing command/output is recorded.

---

### Task 2: Implement additive tables/constraints/grants

**Files:**
- Create: `supabase/migrations/202609020001_admin_order_operations_foundation.sql`
- Test: `tests/admin-order-foundation-migration.test.ts`

- [ ] **Step 1: Add fulfillment column/backfill/default/check without `NOT NULL`**

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
    select 1 from pg_constraint where conname = 'orders_fulfillment_status_allowed'
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

- [ ] **Step 2: Create `order_events`**

```sql
create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{2,63}$'),
  source text not null check (source in (
    'system', 'mercadopago', 'admin', 'shipment', 'notification', 'customer'
  )),
  dedupe_key text unique check (
    dedupe_key is null or length(dedupe_key) between 1 and 200
  ),
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

- [ ] **Step 4: Create append-only `admin_audit_log`**

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

- [ ] **Step 5: Run migration test**

```bash
node --experimental-strip-types --test tests/admin-order-foundation-migration.test.ts
```

Expected: still FAIL because the payment RPC assertions are not implemented yet; table/backfill assertions should now pass.

- [ ] **Step 6: Commit the additive table portion only after confirming the expected partial RED**

```bash
git add supabase/migrations/202609020001_admin_order_operations_foundation.sql tests/admin-order-foundation-migration.test.ts
git commit -m "feat: add admin order operation tables"
```

---

### Task 3: Upgrade the payment RPC atomically

**Files:**
- Modify: `supabase/migrations/202609020001_admin_order_operations_foundation.sql`
- Test: `tests/admin-order-foundation-migration.test.ts`

**Consumes:** existing `apply_mercadopago_payment_event` input signature and financial guards.

**Produces:** same function inputs plus extended result fields and atomic event/attention/fulfillment side effects.

- [ ] **Step 1: Preserve the current financial decision rules exactly**

The replacement function must keep these outcomes:

```text
unknown order -> not_found
already approved + different payment id -> ignored
already approved + repeated approved same id -> ignored
already approved + same payment id + refunded/charged_back -> update reversal
current refunded/charged_back + different payment or non-reversal -> ignored
incoming approved with amount/currency mismatch -> manual_review
all other accepted incoming states -> update
```

Keep `FOR UPDATE`, `SECURITY DEFINER`, `SET search_path = ''`, browser-role revocation, and `service_role` execute grant.

- [ ] **Step 2: Add idempotent payment event only after a real update/manual-review outcome**

Do not add an event for `ignored` or `not_found`.

```sql
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

- [ ] **Step 3: Add approved-payment side effects**

```sql
update public.order_attention_flags
set resolved_at = now()
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

- [ ] **Step 4: Add payment attention side effects**

For manual review:

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

For `refunded`, resolve active `payment_charged_back` then open `payment_refunded`; for `charged_back`, resolve active `payment_refunded` then open `payment_charged_back`. Both are `critical`, `source='mercadopago'`, and neither changes `fulfillment_status`.

- [ ] **Step 5: Extend every RPC response**

Use:

```sql
'fulfillment_status', v_order.fulfillment_status,
'fulfillment_transitioned', v_fulfillment_transitioned
```

For `not_found` return:

```sql
'fulfillment_status', null,
'fulfillment_transitioned', false
```

- [ ] **Step 6: Run migration test and verify GREEN**

```bash
node --experimental-strip-types --test tests/admin-order-foundation-migration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202609020001_admin_order_operations_foundation.sql tests/admin-order-foundation-migration.test.ts
git commit -m "feat: advance paid orders atomically"
```

---

### Task 4: Add the fulfillment state machine

**Files:**
- Create: `lib/server/fulfillment.ts`
- Create: `tests/fulfillment.test.ts`

- [ ] **Step 1: Write RED tests**

```ts
import assert from "node:assert/strict"
import test from "node:test"
import {
  allowedAdminFulfillmentTransitions,
  assertAdminFulfillmentTransition,
  isFulfillmentStatus,
} from "../lib/server/fulfillment.ts"

test("recognizes only approved fulfillment statuses", () => {
  for (const status of [
    "awaiting_payment",
    "awaiting_production",
    "in_production",
    "ready_to_ship",
    "shipped",
    "completed",
    "canceled",
  ]) assert.equal(isFulfillmentStatus(status), true)

  assert.equal(isFulfillmentStatus("problem"), false)
  assert.equal(isFulfillmentStatus(null), false)
})

test("payment-approved transition is not exposed as an admin transition", () => {
  assert.deepEqual(allowedAdminFulfillmentTransitions("awaiting_payment"), ["canceled"])
})

test("allows only the approved admin matrix", () => {
  assert.deepEqual(allowedAdminFulfillmentTransitions("awaiting_production"), ["in_production", "canceled"])
  assert.deepEqual(allowedAdminFulfillmentTransitions("in_production"), ["ready_to_ship", "canceled"])
  assert.deepEqual(allowedAdminFulfillmentTransitions("ready_to_ship"), ["shipped", "canceled"])
  assert.deepEqual(allowedAdminFulfillmentTransitions("shipped"), ["completed"])
  assert.deepEqual(allowedAdminFulfillmentTransitions("completed"), [])
  assert.deepEqual(allowedAdminFulfillmentTransitions("canceled"), [])
})

test("production start requires approved payment", () => {
  assert.throws(
    () => assertAdminFulfillmentTransition({
      paymentStatus: "pending",
      from: "awaiting_production",
      to: "in_production",
    }),
    /approved payment required/,
  )
})
```

- [ ] **Step 2: Verify RED**

```bash
node --experimental-strip-types --test tests/fulfillment.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Verify GREEN**

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

### Task 5: Extend `orders.ts` payment/order contracts

**Files:**
- Modify: `lib/server/orders.ts`
- Modify: `tests/orders-payment-rpc.test.ts`
- Modify: `tests/orders.test.ts`

- [ ] **Step 1: Update `orders-payment-rpc` test first**

Successful mock/expected result must add:

```ts
fulfillment_status: "awaiting_production",
fulfillment_transitioned: true,
```

Add a malformed-response test where `fulfillment_status` is `"made_up_status"` and assert rejection.

- [ ] **Step 2: Verify RED**

```bash
node --experimental-strip-types --test tests/orders-payment-rpc.test.ts
```

Expected: FAIL because current parser does not include the new fields.

- [ ] **Step 3: Update `orders.ts`**

```ts
import {
  isFulfillmentStatus,
  type FulfillmentStatus,
} from "./fulfillment.ts"
```

Add:

```ts
fulfillment_status: FulfillmentStatus
```

to `OrderRecord`, add `"fulfillment_status"` to `ORDER_SELECT`, and replace `PaymentEventResult` with the locked interface above.

Validate:

```ts
if (
  result.fulfillment_status !== null &&
  !isFulfillmentStatus(result.fulfillment_status)
) {
  throw new Error("Payment event RPC returned an invalid response")
}

if (typeof result.fulfillment_transitioned !== "boolean") {
  throw new Error("Payment event RPC returned an invalid response")
}
```

Do not change the RPC request body or accept fulfillment input from checkout/browser.

- [ ] **Step 4: Update `tests/orders.test.ts` fixtures**

Use `fulfillment_status: "awaiting_payment"` for new pending-order fixtures/returned rows.

- [ ] **Step 5: Verify GREEN**

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

### Task 6: Add recursive safe-metadata validation

**Files:**
- Create: `lib/server/safe-metadata.ts`
- Create: `tests/safe-metadata.test.ts`

- [ ] **Step 1: Write RED tests**

```ts
import assert from "node:assert/strict"
import test from "node:test"
import { assertSafeMetadata } from "../lib/server/safe-metadata.ts"

test("accepts bounded non-secret JSON metadata", () => {
  assert.doesNotThrow(() => assertSafeMetadata({ reason: "payment_approved", amount_cents: 11990 }, "metadata"))
})

test("rejects nested secret-like keys", () => {
  for (const value of [
    { access_token: "x" },
    { nested: { refreshToken: "x" } },
    { nested: [{ client_secret: "x" }] },
    { checkout_url: "https://example.invalid" },
    { checkoutFingerprint: "abc" },
  ]) {
    assert.throws(() => assertSafeMetadata(value, "metadata"), /unsafe metadata key/)
  }
})

test("rejects oversized or non-json metadata", () => {
  assert.throws(() => assertSafeMetadata({ body: "x".repeat(17_000) }, "metadata"), /metadata too large/)
  assert.throws(() => assertSafeMetadata({ n: Number.NaN }, "metadata"), /non-json metadata value/)
})
```

- [ ] **Step 2: Verify RED**

```bash
node --experimental-strip-types --test tests/safe-metadata.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement bounded recursive validation**

Normalize keys by removing `_`/`-` and lowercasing before checking forbidden fragments so `refreshToken`, `refresh_token`, and `refresh-token` are all rejected.

Use forbidden fragments:

```ts
const FORBIDDEN_KEY_FRAGMENTS = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "fingerprint",
  "checkouturl",
] as const
```

Traverse plain objects/arrays recursively, maximum depth 8, reject cycles, reject non-finite numbers and non-JSON values, then verify `Buffer.byteLength(JSON.stringify(value), "utf8") <= 16 * 1024`.

- [ ] **Step 4: Verify GREEN**

```bash
node --experimental-strip-types --test tests/safe-metadata.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/safe-metadata.ts tests/safe-metadata.test.ts
git commit -m "feat: validate operational metadata"
```

---

### Task 7: Add order event repository with correct PostgREST dedupe behavior

**Files:**
- Create: `lib/server/order-events.ts`
- Create: `tests/order-events.test.ts`
- Consume: `lib/server/safe-metadata.ts`

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

- [ ] **Step 1: Write RED REST-contract tests**

For a deduped append, assert the URL includes both:

```text
on_conflict=dedupe_key
select=id,order_id,event_type,source,dedupe_key,metadata,created_at
```

and the `Prefer` header includes:

```text
resolution=ignore-duplicates,return=representation
```

For append without a dedupe key, do **not** add `on_conflict`/upsert preference; perform an ordinary POST with `return=representation`.

List query must use `order_id=eq.<uuid>`, `order=created_at.desc`, and bounded `limit` (`1..200`, default `100`).

Tests also reject invalid UUID, code/source, unsafe metadata, and dedupe key longer than 200 characters before fetch.

- [ ] **Step 2: Verify RED**

```bash
node --experimental-strip-types --test tests/order-events.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement**

Use `getSupabaseEnv()`, `cache: "no-store"`, `AbortSignal.timeout(10_000)`, UUID regex:

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CODE_RE = /^[a-z][a-z0-9_]{2,63}$/
```

Call `assertSafeMetadata(input.metadata, "metadata")` before POST.

On a deduped POST, an empty representation is returned as `null`; do not treat it as an error.

Failure logs include only operation/table/status, never metadata/response bodies.

- [ ] **Step 4: Verify GREEN and commit**

```bash
node --experimental-strip-types --test tests/order-events.test.ts
git add lib/server/order-events.ts tests/order-events.test.ts
git commit -m "feat: add order event repository"
```

---

### Task 8: Add attention repository without relying on unsupported partial-index upsert targeting

**Files:**
- Create: `lib/server/order-attention.ts`
- Create: `tests/order-attention.test.ts`
- Consume: `lib/server/safe-metadata.ts`

**Interfaces:**

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

export async function listOpenOrderAttention(orderId: string): Promise<OrderAttentionRecord[]>
```

- [ ] **Step 1: Write RED tests**

Open uses ordinary POST with `Prefer: return=representation`. Because uniqueness is enforced by a **partial unique index** on active `(order_id, code)`, do not use `on_conflict=order_id,code`.

Mock a `409` payload with PostgreSQL code `23505` and message containing `order_attention_active_code_uidx`; `openOrderAttention` must return `null` for that exact duplicate-active case and throw for other 409 errors.

Resolve PATCH filters:

```text
order_id=eq.<uuid>
code=eq.<code>
resolved_at=is.null
```

and sends only `{ resolved_at: <ISO timestamp> }` with `return=representation`.

List filters `resolved_at=is.null` and sorts `opened_at.desc`.

- [ ] **Step 2: Verify RED**

```bash
node --experimental-strip-types --test tests/order-attention.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement strict validation and exact duplicate handling**

Use the same UUID/code/source rules and `assertSafeMetadata`. Only treat the named `23505` active-index conflict as an idempotent duplicate; other storage failures throw generic server errors after safe logging.

- [ ] **Step 4: Verify GREEN and commit**

```bash
node --experimental-strip-types --test tests/order-attention.test.ts
git add lib/server/order-attention.ts tests/order-attention.test.ts
git commit -m "feat: add order attention repository"
```

---

### Task 9: Add append-only admin audit repository

**Files:**
- Create: `lib/server/admin-audit.ts`
- Create: `tests/admin-audit.test.ts`
- Consume: `lib/server/safe-metadata.ts`

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

No update/delete exports exist.

- [ ] **Step 1: Write RED tests**

Prove:

- append uses POST + `return=representation`;
- list filters entity type/id and sorts newest-first;
- invalid admin UUID/code/entity ID/limit fails before fetch;
- `assertSafeMetadata` is applied recursively to `previousValues`, `newValues`, and `metadata`;
- module exports no `updateAdminAudit`/`deleteAdminAudit`.

- [ ] **Step 2: Verify RED**

```bash
node --experimental-strip-types --test tests/admin-audit.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement append/list only**

Bound entity ID length to 1..128 and list limit to 1..200/default 100. Safe failure logging must omit payload values.

- [ ] **Step 4: Verify GREEN and commit**

```bash
node --experimental-strip-types --test tests/admin-audit.test.ts
git add lib/server/admin-audit.ts tests/admin-audit.test.ts
git commit -m "feat: add append-only admin audit repository"
```

---

### Task 10: Full Phase 1 repository verification

**Files:**
- Modify checkpoint docs only after fresh evidence exists.

- [ ] **Step 1: Run all Phase 1 focused tests**

```bash
node --experimental-strip-types --test \
  tests/admin-order-foundation-migration.test.ts \
  tests/fulfillment.test.ts \
  tests/safe-metadata.test.ts \
  tests/orders-payment-rpc.test.ts \
  tests/orders.test.ts \
  tests/order-events.test.ts \
  tests/order-attention.test.ts \
  tests/admin-audit.test.ts
```

Expected: zero failures.

- [ ] **Step 2: Run complete repository suite**

```bash
pnpm test
```

Expected: zero failures.

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: exit 0.

- [ ] **Step 4: Run build**

```bash
pnpm build
```

Expected: exit 0 in GitHub CI/Linux. Do not substitute the known Android/Termux native-SWC limitation for CI evidence.

- [ ] **Step 5: Review exact diff**

Allowed Phase 1 scope:

```text
one additive Phase 1 migration
fulfillment module
safe metadata module
order payment-result contract update
event/attention/audit repositories
Phase 1 tests
checkpoint documentation
```

Reject unrelated storefront/catalog/hosting/refactor changes.

- [ ] **Step 6: Update checkpoint docs and commit**

Record exact RED/GREEN evidence, full verification, and last verified SHA in Master Plan and `CURRENT_STATUS.md`.

```bash
git add docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md docs/superpowers/CURRENT_STATUS.md
git commit -m "docs: checkpoint admin data foundation"
```

---

### Task 11: Apply/validate the additive migration outside Production

**Files:**
- No new runtime files unless validation exposes a Phase 1 defect.

- [ ] **Step 1: Re-read the exact migration candidate**

Confirm no `fulfillment_status NOT NULL`, destructive drop/delete, checkout authority change, or fabricated retroactive events.

- [ ] **Step 2: Apply the migration to the intended Preview/Sandbox Supabase environment**

Record only migration name, environment label, and success/failure. Never record credentials or customer PII.

- [ ] **Step 3: Validate backfill/security with safe aggregate queries**

Prove:

```text
existing approved -> awaiting_production
existing non-approved -> awaiting_payment
new insert omitting fulfillment_status -> awaiting_payment
no retroactive order_events from the backfill
anon/authenticated cannot read/write operational history tables
service_role grants match the migration
```

- [ ] **Step 4: Validate payment RPC with controlled Sandbox fixtures**

Prove:

```text
pending + trusted approved exact amount -> approved + awaiting_production + transitioned=true
repeat same approved -> ignored + no duplicate payment/fulfillment event
approved -> refunded -> fulfillment unchanged + payment_refunded attention
approved -> charged_back -> fulfillment unchanged + payment_charged_back attention
amount/currency mismatch -> manual_review + payment_manual_review attention
```

- [ ] **Step 5: Deploy Phase 1 code candidate to Preview only after migration success**

Smoke-check existing checkout creation, public order page, admin login/MFA, and Mercado Pago webhook test path. Phase 1 adds no new admin UI.

- [ ] **Step 6: Review Preview runtime error/fatal logs**

Record presence/absence of Phase 1 database/RPC errors without logging sensitive payloads.

- [ ] **Step 7: Stop at the Production approval gate**

Do not apply the migration to Production, merge, or enable any Production behavior without explicit owner approval.

---

## Phase 1 Completion Gate

Phase 1 can be marked complete only when:

- RED evidence exists for each implemented unit;
- migration/schema/RPC tests pass;
- fulfillment and recursive metadata tests pass;
- order payment parser/repository tests pass;
- event/attention/audit repository tests pass;
- full `pnpm test`, `pnpm typecheck`, and `pnpm build` pass on the exact candidate;
- non-Production migration/RPC validation succeeds;
- Preview smoke checks show no checkout/public-order/admin-auth regression;
- checkpoint docs record exact evidence;
- Production remains unchanged unless separately authorized.

**Next phase after acceptance:** write/review `docs/superpowers/plans/2026-09-02-admin-orders-fulfillment.md` before creating `/admin/pedidos`, `/admin/pedidos/[id]`, or `/admin/producao`.
