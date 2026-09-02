# ProxyBembem Phase 2 — Admin Orders + Fulfillment Implementation Plan

> **Execution rule:** Implement this plan with TDD, one small unit at a time. Do not merge the feature branch or deploy new Phase 2 application code to Production without explicit owner approval. The existing Supabase project is the project's established database workflow; meaningful new DDL still requires explicit owner approval before application.

**Goal:** Turn the existing protected `/admin` into a usable order/production operations panel without giving the administrator arbitrary payment mutation or weakening the current checkout/payment/admin-auth boundaries.

**Architecture:** Keep read and write paths separated. Admin order reads use a dedicated backend-only repository and a bounded SQL list RPC. Fulfillment writes use narrow HTTP endpoints whose target state is server-wired, not browser-selected. A service-role-only Postgres RPC locks the order and atomically performs the allowed fulfillment transition, `order_events`, `admin_audit_log`, and any required attention flag. The existing Mercado Pago RPC remains the only provider-authoritative payment state writer.

**Visual model:** Reuse the current light/white-card/violet admin style. Add one shared admin shell component, but do not move login/MFA routes or depend on a hidden admin URL.

**Phase 1 dependencies already present:**

- `orders.fulfillment_status`
- `order_events`
- `order_attention_flags`
- `admin_audit_log`
- `lib/server/fulfillment.ts`
- `lib/server/order-events.ts`
- `lib/server/order-attention.ts`
- `lib/server/admin-audit.ts`
- mandatory admin AAL2 + active server-side admin session

**Known environment blocker:** Vercel Preview currently lacks `NEXT_PUBLIC_SUPABASE_URL` and likely needs the complete Preview admin-auth env contract before protected routes can be smoke-tested. Do not confuse that configuration problem with a Phase 2 code defect.

---

## 0. Non-negotiable Phase 2 invariants

- Payment status remains Mercado Pago/provider-authoritative.
- No admin UI/API can set `payment_status`, `payment_id`, `payment_status_detail`, or mark an order paid/refunded directly.
- Browser requests never supply an arbitrary fulfillment target.
- Every fulfillment write re-authorizes the admin server-side with AAL2/active-session enforcement.
- Every fulfillment write is same-origin protected and POST-only.
- Fulfillment transition + event + audit are one database transaction.
- Transition code locks the order row before evaluating state.
- Normal production transitions are one-click; cancellation gets explicit destructive confirmation.
- Paid cancellation never implies or performs a refund. Financial state remains unchanged and a critical operational attention flag is created.
- Existing `orders.items` remains immutable purchase history.
- List/detail DTOs intentionally exclude `public_token`, `checkout_fingerprint`, `checkout_url`, `shipping_snapshot`, service-role material, OAuth credentials, and other unnecessary internals.
- No broad generic order PATCH endpoint is introduced.
- No shipping-label purchase/generation enters Phase 2.
- No customer account work enters Phase 2.
- No catalog authority change enters Phase 2.

---

## 1. Planned file map

### New migration

`supabase/migrations/202609020002_admin_order_fulfillment_operations.sql`

### New server modules

- `lib/server/admin-orders.ts`
- `lib/server/admin-order-operations.ts`
- `lib/server/admin-order-actions.ts`

### Shared admin UI

- `components/admin/admin-shell.tsx`
- `components/admin/admin-nav.tsx`
- `components/admin/status-badge.tsx`
- `components/admin/danger-confirm-form.tsx`

### New protected pages

- `app/admin/pedidos/page.tsx`
- `app/admin/pedidos/[id]/page.tsx`
- `app/admin/producao/page.tsx`

### Narrow mutation routes

- `app/api/internal/admin/orders/[id]/start-production/route.ts`
- `app/api/internal/admin/orders/[id]/mark-ready-to-ship/route.ts`
- `app/api/internal/admin/orders/[id]/mark-shipped/route.ts`
- `app/api/internal/admin/orders/[id]/mark-completed/route.ts`
- `app/api/internal/admin/orders/[id]/cancel/route.ts`

Route files must export only valid App Router route exports (`POST`, `runtime`, etc.). Handler factories stay under `lib/server/`.

### Existing files expected to change

- `app/admin/page.tsx`
- `app/admin/integrations/melhor-envio/page.tsx`
- `tests/admin-auth-ui.test.ts`
- `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`
- `docs/superpowers/CURRENT_STATUS.md`

### New tests

- `tests/admin-order-operations-migration.test.ts`
- `tests/admin-orders-repository.test.ts`
- `tests/admin-order-operations.test.ts`
- `tests/admin-order-actions.test.ts`
- `tests/admin-orders-ui.test.ts`
- `tests/admin-production-ui.test.ts`

Do not add unrelated files merely to make the implementation feel more generic.

---

# Task 1 — RED: define the Phase 2 database contract

**Files:**

- Create `tests/admin-order-operations-migration.test.ts`
- Migration must not exist yet when RED is captured.

## Step 1.1 — Assert migration existence and additive scope

Test reads:

`supabase/migrations/202609020002_admin_order_fulfillment_operations.sql`

Initial expected RED: `ENOENT` / missing migration.

The eventual test must reject destructive schema behavior:

- no `drop table orders`;
- no delete/backfill of customer orders;
- no payment-status direct admin function;
- no broad grant to `anon` or `authenticated`;
- no change that makes `fulfillment_status` browser writable.

## Step 1.2 — Specify `admin_list_orders`

Require one bounded SQL function:

`public.admin_list_orders(...)`

Parameters should cover only list concerns:

- normalized optional search query;
- optional payment status;
- optional fulfillment status;
- optional `attention_required` boolean;
- optional date lower/upper bounds;
- limit;
- offset.

Required behavior:

- static SQL, not dynamic SQL string building;
- `limit` bounded to max 50;
- offset nonnegative;
- search matches order number, customer name, or WhatsApp using parameterized SQL;
- attention filter uses `exists` against open `order_attention_flags`;
- newest orders first with a deterministic tie-breaker;
- returns total count without making the browser load all orders;
- returns only list-safe fields;
- service-role-only execute;
- fixed/empty search path.

Suggested list fields:

```text
id
order_number
customer_name
whatsapp
total_cents
payment_status
payment_status_detail
fulfillment_status
created_at
updated_at
open_attention_count
open_attention_severity
total_count
```

Do not include `public_token`, checkout URL/fingerprint, provider snapshots, or secrets.

## Step 1.3 — Specify atomic `admin_transition_order_fulfillment`

Require one backend-only RPC:

`public.admin_transition_order_fulfillment(p_order_id uuid, p_admin_user_id uuid, p_target_status text)`

Required transaction behavior:

1. `SELECT ... FOR UPDATE` the order.
2. Return `not_found` when no order exists.
3. If current state already equals target, return `unchanged` without a duplicate event/audit.
4. Validate the same transition matrix as `lib/server/fulfillment.ts`:
   - `awaiting_payment -> canceled`
   - `awaiting_production -> in_production | canceled`
   - `in_production -> ready_to_ship | canceled`
   - `ready_to_ship -> shipped | canceled`
   - `shipped -> completed`
   - no transitions out of `completed` or `canceled`.
5. `awaiting_production -> in_production` requires `payment_status='approved'`.
6. Update `orders.fulfillment_status` and `updated_at` only after validation.
7. Insert one `order_events` row with source `admin` and event type `fulfillment_status_changed`.
8. Insert one `admin_audit_log` row in the same transaction.
9. When target is `canceled` and payment is still `approved`, open critical attention code `canceled_paid_order`; do **not** modify payment state.
10. Return strict JSON fields describing outcome/current state/payment state.

Required outcomes:

```text
transitioned
unchanged
not_found
invalid_transition
payment_precondition_failed
```

The RPC must not accept payment fields and must not call Mercado Pago.

## Step 1.4 — Audit mapping

The migration test should require stable audit actions derived by the database, not browser text. Recommended mapping:

```text
in_production -> production_started
ready_to_ship -> marked_ready_to_ship
shipped -> marked_shipped
completed -> marked_completed
canceled -> order_canceled
```

Audit rows:

```json
previous_values: {"fulfillment_status":"..."}
new_values: {"fulfillment_status":"..."}
```

Metadata must remain non-secret and bounded.

## Step 1.5 — Run RED

```bash
node --experimental-strip-types --test tests/admin-order-operations-migration.test.ts
```

Expected: fails only because the Phase 2 migration does not exist.

Record the exact failing commit and output summary in Master Plan/CURRENT_STATUS before GREEN.

Commit test-only RED:

```text
test: define admin order operations migration
```

---

# Task 2 — GREEN: implement the Phase 2 migration

**Files:**

- Create `supabase/migrations/202609020002_admin_order_fulfillment_operations.sql`

## Step 2.1 — Implement `admin_list_orders`

Use stable SQL and service-role-only access.

Security requirements:

- `SECURITY DEFINER` only if needed for predictable RLS/grant behavior;
- `set search_path = ''`;
- fully qualified table names;
- revoke execute from `public`, `anon`, `authenticated`;
- grant execute only to `service_role`.

The function must validate/bound pagination in SQL even though TypeScript validates first.

Search input is a data value, never concatenated into executable SQL.

## Step 2.2 — Implement `admin_transition_order_fulfillment`

Keep the transition matrix directly visible in SQL. Do not rely exclusively on the TypeScript helper because the database is the concurrency boundary.

Use the locked row's **actual** current state and payment state.

Recommended result shape:

```json
{
  "outcome": "transitioned|unchanged|not_found|invalid_transition|payment_precondition_failed",
  "order_id": "uuid|null",
  "order_number": "PB-...|null",
  "payment_status": "approved|...|null",
  "previous_fulfillment_status": "...|null",
  "fulfillment_status": "...|null"
}
```

Do not return provider secrets or checkout internals.

## Step 2.3 — Event dedupe

A valid state transition is monotonic in this phase, so use a deterministic dedupe key such as:

```text
admin-fulfillment:<order_id>:<from>:<to>
```

If a retry finds the order already at target, return `unchanged` before inserting a second event/audit.

## Step 2.4 — Paid cancellation attention

When `target='canceled'` and the locked order has `payment_status='approved'`:

- insert/open `canceled_paid_order`;
- severity `critical`;
- source `admin`;
- metadata may include only safe financial status context, never tokens;
- do not refund and do not change payment status.

This makes the operational cancellation truthful without pretending the provider reversed money.

## Step 2.5 — Run focused migration test

```bash
node --experimental-strip-types --test tests/admin-order-operations-migration.test.ts
```

Expected: PASS.

Then run the existing Phase 1 migration/payment tests to prove no regression:

```bash
node --experimental-strip-types --test \
  tests/admin-order-foundation-migration.test.ts \
  tests/payment-rpc-contract.test.ts \
  tests/orders-payment-rpc.test.ts \
  tests/fulfillment.test.ts
```

Commit:

```text
feat: add atomic admin fulfillment operations
```

Do **not** apply the migration to Supabase yet. Application comes after the whole Phase 2 code path is tested and the exact DDL is re-reviewed.

---

# Task 3 — RED/GREEN: admin order read repository

**Files:**

- Create `tests/admin-orders-repository.test.ts`
- Create `lib/server/admin-orders.ts`

## Step 3.1 — RED list tests

Define:

```ts
listAdminOrders(input)
```

Input contract:

```ts
{
  query?: string
  paymentStatus?: string
  fulfillmentStatus?: FulfillmentStatus
  attentionRequired?: boolean
  from?: string
  to?: string
  page?: number
  pageSize?: number // max 50, UI default 25
}
```

Tests must prove:

- empty input uses page 1/page size 25;
- page/pageSize bounds fail before fetch;
- query is trimmed and length-bounded;
- invalid fulfillment status fails before fetch;
- malformed dates fail before fetch;
- repository calls only `rpc/admin_list_orders`;
- exact RPC argument names are stable;
- response parsing rejects malformed rows;
- result returns `{orders,total,page,pageSize}`;
- no client/bare browser Supabase client is used.

## Step 3.2 — RED detail tests

Define:

```ts
getAdminOrderById(orderId)
```

Tests require canonical UUID input and a dedicated safe select list.

Allowed detail fields include:

```text
id
order_number
customer_name
whatsapp
cep
address_*
items
subtotal_cents
shipping provider/service/carrier/delivery fields
shipping_cents
total_cents
payment_provider
preference_id
payment_id
payment_status
payment_status_detail
fulfillment_status
created_at
updated_at
```

Explicitly reject selecting/displaying:

```text
public_token
checkout_fingerprint
checkout_url
shipping_snapshot
SUPABASE_SECRET_KEY
provider credentials
```

## Step 3.3 — GREEN implementation

Reuse `getSupabaseEnv()` and the established 10-second no-store REST pattern.

Keep this module read-only. It must not expose a generic PATCH method.

## Step 3.4 — Run focused tests

```bash
node --experimental-strip-types --test tests/admin-orders-repository.test.ts
```

Expected: PASS.

Commit:

```text
feat: add admin order read repository
```

---

# Task 4 — RED/GREEN: strict admin fulfillment RPC repository

**Files:**

- Create `tests/admin-order-operations.test.ts`
- Create `lib/server/admin-order-operations.ts`

## Step 4.1 — Define strict operation API

Expose one server-only function:

```ts
transitionAdminOrderFulfillment({
  orderId,
  adminUserId,
  targetStatus,
})
```

The target type is `FulfillmentStatus`, but this function is not exported to the browser.

Tests require:

- canonical order/admin UUIDs;
- target is known fulfillment status;
- exact RPC path `rpc/admin_transition_order_fulfillment`;
- exact argument names;
- strict result parser;
- sanitized network/storage errors;
- no provider body or secret logging.

Expected result union mirrors SQL outcomes.

## Step 4.2 — Keep TypeScript preflight non-authoritative

The module may call `isFulfillmentStatus`, but it must not pretend it knows the current state before the DB lock. The SQL RPC is the final transition authority.

## Step 4.3 — Run focused test

```bash
node --experimental-strip-types --test tests/admin-order-operations.test.ts
```

Commit:

```text
feat: add admin fulfillment repository
```

---

# Task 5 — RED/GREEN: narrow POST handlers

**Files:**

- Create `tests/admin-order-actions.test.ts`
- Create `lib/server/admin-order-actions.ts`
- Create the five route files listed in the file map.

## Step 5.1 — Handler factory contract

Create a factory under `lib/server/admin-order-actions.ts` that receives the target status as **server wiring**, not request JSON.

Example concept:

```ts
createAdminOrderActionHandler({
  targetStatus: "in_production",
  authorizeAdmin,
  transitionOrder,
})
```

The route file for `start-production` wires `targetStatus: "in_production"`.

The browser must not be able to change that target with body/query params.

## Step 5.2 — Same-origin and authorization order

Tests require this order:

1. resolve/check site/request origin;
2. reject cross-site Origin with 403;
3. authorize AAL2 active admin session with `touch:true`;
4. parse/validate dynamic order UUID;
5. execute RPC with `principal.userId` as `adminUserId`;
6. map result.

Do not trust a browser-supplied admin UUID.

## Step 5.3 — Result mapping

Recommended behavior:

- `transitioned` -> 303 back to `/admin/pedidos/<id>?status=updated`;
- `unchanged` -> 303 back with `status=unchanged`;
- `not_found` -> 404;
- `invalid_transition` -> 409;
- `payment_precondition_failed` -> 409;
- auth unavailable/storage unavailable -> 503;
- non-admin -> 403;
- unauthenticated/MFA/session failure -> 401.

All responses private/no-store.

If implementation chooses redirect-on-domain-error for better HTML form UX, tests must still preserve safe/explicit status semantics in the handler result layer. Do not silently report success.

## Step 5.4 — Cancellation is special only in UI confirmation

Backend cancellation uses the same atomic transition RPC and does not accept payment mutation fields.

The database handles `canceled_paid_order` attention when needed.

## Step 5.5 — Route module export safety

Each `route.ts` exports only `runtime` and `POST`. Never export factories/helpers from App Router route modules.

## Step 5.6 — Run focused tests

```bash
node --experimental-strip-types --test tests/admin-order-actions.test.ts
```

Commit:

```text
feat: add narrow admin order actions
```

---

# Task 6 — RED/GREEN: shared admin shell without moving auth routes

**Files:**

- Create `components/admin/admin-shell.tsx`
- Create `components/admin/admin-nav.tsx`
- Create `components/admin/status-badge.tsx`
- Modify `app/admin/page.tsx`
- Modify `app/admin/integrations/melhor-envio/page.tsx`
- Modify `tests/admin-auth-ui.test.ts`
- Add shell coverage to `tests/admin-orders-ui.test.ts`

## Step 6.1 — Do not move login/MFA routes

Keep:

```text
/admin/login
/admin/mfa
/admin/setup-mfa
```

outside the protected content shell so auth screens remain focused and cannot recurse through protected layout auth.

Do not introduce a route-group migration just for aesthetics in this phase.

## Step 6.2 — Shared shell structure

`AdminShell` should render:

- ProxyBembem admin brand/title;
- compact responsive navigation;
- logout form;
- current section title/description;
- page content container.

Phase 2 live navigation entries:

```text
Visão geral -> /admin
Pedidos -> /admin/pedidos
Produção -> /admin/producao
Integrações -> /admin/integrations/melhor-envio
```

Do not add links to Clientes/Produtos/Envios/Configurações/Auditoria until those routes exist.

Desktop may use a horizontal/side navigation appropriate to the current card design. Mobile must collapse cleanly without horizontal overflow.

## Step 6.3 — Auth touch behavior

Each protected page still calls:

```ts
await requireAdminPageAccess({ touch: true })
```

Do not put background polling in the shell.

Mutation routes separately call `authorizeAdminAccess({touch:true})`.

## Step 6.4 — Preserve current integration route

`/admin/integrations/melhor-envio` keeps its URL and OAuth form action. Only wrap its visual content in the shared shell.

## Step 6.5 — Update auth regression tests

Tests must still prove:

- admin pages use protected access;
- login uses `touch:false` where currently required;
- protected meaningful pages use `touch:true`;
- storefront chrome stays absent from `/admin`;
- logout remains POST-only;
- no client secrets enter admin shell components.

Commit:

```text
feat: add shared admin shell
```

---

# Task 7 — RED/GREEN: `/admin/pedidos`

**Files:**

- Create `tests/admin-orders-ui.test.ts`
- Create `app/admin/pedidos/page.tsx`

## Step 7.1 — URL-driven server filters

Use GET/search params, not client-only hidden state.

Supported query params:

```text
q
payment
fulfillment
attention
from
to
page
```

Normalize all params server-side through one small parser/helper in the page or a dedicated pure helper if tests justify it.

Malformed filter values should fall back safely or show a controlled invalid-filter state; never pass arbitrary values to SQL.

## Step 7.2 — List UI

Each order result shows at minimum:

- order number;
- customer name;
- date/time;
- total;
- payment badge;
- fulfillment badge;
- attention indicator;
- link to detail.

Desktop: table/list card with clear columns.

Mobile: stacked card rows; no tiny horizontally scrolling financial table.

## Step 7.3 — Payment badge remains read-only

No action named:

```text
Marcar como pago
Aprovar pagamento
Forçar status
Reembolsar localmente
```

Payment filter/display is allowed; payment mutation is not.

## Step 7.4 — Pagination

Server-side page size default 25, max 50.

Previous/next links preserve active filters.

Do not fetch all orders and paginate in React.

## Step 7.5 — Tests

Static/UI tests require:

- `requireAdminPageAccess({touch:true})`;
- `listAdminOrders` server call;
- all approved filter names;
- payment/fulfillment/attention badges;
- no forbidden payment mutation copy;
- links to `/admin/pedidos/<id>`;
- no public token/fingerprint/checkout URL text.

Commit:

```text
feat: add admin orders list
```

---

# Task 8 — RED/GREEN: `/admin/pedidos/[id]`

**Files:**

- Extend `tests/admin-orders-ui.test.ts`
- Create `app/admin/pedidos/[id]/page.tsx`

## Step 8.1 — Data composition

After admin authorization, load in parallel where safe:

```ts
getAdminOrderById(id)
listOrderEvents(id)
listOpenOrderAttention(id)
listAdminAuditForEntity({ entityType: "order", entityId: id })
```

If order does not exist, use Next `notFound()`.

Do not load arbitrary audit history for unrelated entities.

## Step 8.2 — Detail sections

Recommended order:

1. header/summary;
2. fulfillment action area;
3. attention warnings;
4. purchased item snapshot;
5. customer/contact;
6. delivery address;
7. shipping quote snapshot fields safe for admin display;
8. Mercado Pago read-only status/details;
9. operational timeline from `order_events`;
10. admin audit history.

Do not render raw `shipping_snapshot` JSON or checkout/public tokens.

## Step 8.3 — Fulfillment actions

Use `allowedAdminFulfillmentTransitions(order.fulfillment_status)` to decide which **buttons to render**, but remember that the database revalidates under lock.

Action mapping:

```text
awaiting_payment -> Cancelar
awaiting_production -> Iniciar produção | Cancelar
in_production -> Marcar pronto para envio | Cancelar
ready_to_ship -> Marcar enviado | Cancelar
shipped -> Marcar concluído
completed -> no transition buttons
canceled -> no transition buttons
```

If `awaiting_production -> in_production` somehow has non-approved payment, render a warning rather than an enabled start button. Database still rejects it.

## Step 8.4 — Cancellation copy

Cancellation confirmation must say plainly that:

- fulfillment will be canceled;
- this does **not** automatically refund Mercado Pago;
- a paid canceled order may require financial follow-up.

Do not imply money was returned.

## Step 8.5 — Status feedback

Support safe status messages from redirect query params such as:

```text
updated
unchanged
```

Do not echo arbitrary error strings from query params.

Commit:

```text
feat: add admin order detail
```

---

# Task 9 — RED/GREEN: destructive confirmation component

**Files:**

- Create `components/admin/danger-confirm-form.tsx`
- Extend `tests/admin-orders-ui.test.ts`

Use the already-installed Radix dialog package or an equivalent accessible modal already present in the project. Do not add a dependency solely for this confirmation if existing UI primitives suffice.

The component receives only safe UI values:

```text
action URL
button label
title
description
confirm label
```

It must not receive service-role/admin credentials or payment secrets.

Tests require:

- cancellation uses a confirmation step;
- action remains POST;
- ordinary production transitions do not require the destructive modal;
- no accidental form submit before confirmation.

Commit:

```text
feat: confirm destructive admin actions
```

---

# Task 10 — RED/GREEN: `/admin/producao`

**Files:**

- Create `tests/admin-production-ui.test.ts`
- Create `app/admin/producao/page.tsx`

## Step 10.1 — Three operational queues

Show only:

```text
Aguardando produção
Em produção
Pronto para envio
```

Use bounded server queries with `listAdminOrders` and each fulfillment filter.

Recommended max per queue for Phase 2: 50.

Do not query/load completed/canceled history into this page.

## Step 10.2 — Sorting

For active production queues, oldest-first is operationally useful. If `admin_list_orders` only supports newest-first initially, add an explicit bounded sort parameter only if implementation remains static/allowlisted. Do not build arbitrary SQL ordering from browser text.

Prefer adding a fixed `sort='oldest'|'newest'` server allowlist over client sorting all rows.

If this complicates the initial RPC significantly, keep newest-first in the first GREEN implementation and record oldest-first as a Phase 2 refinement before acceptance; do not silently load all records to sort client-side.

## Step 10.3 — Cards

Each queue card shows:

- order number;
- customer;
- created date;
- total;
- payment badge;
- attention indicator;
- link to order detail.

Do not duplicate sensitive full address/payment IDs on queue cards.

Commit:

```text
feat: add production queue
```

---

# Task 11 — Full Phase 2 verification before database application

## Step 11.1 — Focused suite

```bash
node --experimental-strip-types --test \
  tests/admin-order-operations-migration.test.ts \
  tests/admin-orders-repository.test.ts \
  tests/admin-order-operations.test.ts \
  tests/admin-order-actions.test.ts \
  tests/admin-orders-ui.test.ts \
  tests/admin-production-ui.test.ts \
  tests/fulfillment.test.ts \
  tests/admin-auth-ui.test.ts \
  tests/orders-payment-rpc.test.ts \
  tests/webhook-route.test.ts
```

Expected: zero failures.

## Step 11.2 — Full gates

```bash
pnpm test
pnpm typecheck
pnpm build
```

All must pass on the exact candidate SHA in GitHub CI.

## Step 11.3 — Scope review

Compare Phase 2 base/candidate and reject unrelated changes.

Allowed runtime scope:

```text
one additive Phase 2 migration
admin order read/operation/action server modules
shared admin shell components
admin orders list/detail/production pages
narrow admin fulfillment POST routes
relevant tests
checkpoint docs
```

No customer account, product DB authority, label spending, email provider, or hosting work.

## Step 11.4 — Security review

Explicitly verify:

- no browser payment mutation;
- no client-supplied admin UUID;
- no client-supplied arbitrary target status;
- all mutation routes same-origin + admin-authorized;
- route modules export no helper factories;
- detail/list exclude public token and checkout internals;
- audit/event insertion is atomic inside SQL transition;
- cancellation of paid order creates attention and does not alter provider payment state.

Commit checkpoint docs only after evidence exists.

---

# Task 12 — Apply and validate the Phase 2 migration on the current Supabase project

The project owner explicitly chose the existing in-place Supabase workflow; do not create a paid development branch as a prerequisite.

**However, this is still a meaningful Production database DDL step. Stop immediately before application and obtain explicit owner approval for the exact Phase 2 migration candidate.**

## Step 12.1 — Re-read exact SQL

Confirm:

- additive only;
- no destructive order changes;
- no payment admin mutation;
- service-role-only RPC grants;
- fixed/empty search paths;
- row lock exists;
- event/audit transaction logic exists;
- no fabricated historical events.

## Step 12.2 — Apply migration with Supabase migration tooling

Record only:

```text
project label
migration name/version
success/failure
```

Never record database credentials or customer PII.

## Step 12.3 — Safe aggregate validation

Verify function existence/grants/security-definer/search-path, not customer row contents.

## Step 12.4 — Controlled transaction + rollback transition validation

Create temporary test orders inside a transaction and rollback all data.

Prove:

```text
awaiting_payment -> canceled succeeds
awaiting_payment -> in_production rejected
awaiting_production + approved -> in_production succeeds
repeat same target -> unchanged and no duplicate event/audit
in_production -> ready_to_ship succeeds
ready_to_ship -> shipped succeeds
shipped -> completed succeeds
completed -> any transition rejected
paid cancel keeps payment approved and creates canceled_paid_order attention
nonexistent id -> not_found
```

After rollback, prove 0 persistent test rows.

## Step 12.5 — Re-run Supabase security/performance advisors

Classify new findings instead of automatically “fixing” intentional backend-only RLS patterns.

---

# Task 13 — Preview acceptance

Phase 2 cannot be marked Preview-approved until the existing Preview admin-auth environment problem is fixed.

## Step 13.1 — Required Preview admin-auth environment contract

At minimum verify presence, without printing secret values:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ADMIN_USER_ID
SUPABASE_URL
SUPABASE_SECRET_KEY
```

Existing admin/integration routes may require their already-documented provider/rate-limit variables as well.

The current connected Vercel tool cannot mutate environment variables. If still true at execution time, the owner must configure them through Vercel settings or another authorized management path; do not commit values to Git.

## Step 13.2 — Preview smoke matrix

After env is fixed and a matching Preview is READY:

```text
/ -> 200
/admin unauthenticated -> admin login surface
admin password + MFA -> protected shell
/admin/pedidos -> bounded list
filters/search/pagination -> expected results
/admin/pedidos/<id> -> safe detail
normal fulfillment transition -> correct new state/event/audit
invalid/stale transition -> controlled conflict
paid cancellation warning/confirmation -> no payment mutation
/admin/producao -> three queues
/admin/integrations/melhor-envio -> existing page still works
public storefront/order tracking -> no regression
```

Do not perform a real Mercado Pago payment or real Melhor Envio label purchase merely for this phase.

## Step 13.3 — Runtime logs

Review Preview error/fatal logs after smoke testing. Distinguish environment/config failures from code/database failures.

---

# Task 14 — Phase 2 completion checkpoint

Phase 2 is complete only when:

- migration and every new server/UI unit have RED -> GREEN evidence;
- focused suite passes;
- exact candidate `pnpm test`, `pnpm typecheck`, `pnpm build` pass in CI;
- exact diff review passes;
- Phase 2 migration is owner-approved, applied, and transaction-tested on the current Supabase project;
- no test rows remain;
- Preview protected admin environment is configured;
- orders list/detail/production smoke checks pass;
- payment remains provider-authoritative;
- current storefront/public order flow has no regression;
- Master Plan and CURRENT_STATUS contain the exact final SHA/evidence;
- merge/new Production application deployment is still separately owner-approved.

**Next phase after Phase 2 acceptance:** write/review `docs/superpowers/plans/2026-09-02-customer-account-orders.md` before customer-account runtime implementation.

---

## Session checkpoint template for Phase 2

```text
Status:
Current task:
Current branch: feat/admin-dashboard-expansion
Last verified commit:

RED evidence:
GREEN evidence:

Focused tests:
pnpm test:
pnpm typecheck:
pnpm build:
GitHub CI:

Supabase migration:
Database validation:
Preview deployment:
Preview smoke:
Production application deployment:

Blockers:

NEXT EXACT ACTION:

DO NOT REDISCOVER:
- payment provider is authoritative
- browser never chooses arbitrary fulfillment target
- fulfillment/event/audit transition is atomic in DB
- paid cancellation does not refund; it creates attention
- no generic admin order/payment PATCH
- Preview env blocker must remain visible until fixed
- no paid Supabase dev branch is required by project workflow
```
