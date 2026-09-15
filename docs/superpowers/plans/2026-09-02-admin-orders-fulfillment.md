# ProxyBembem Phase 2 — Admin Orders + Fulfillment Implementation Plan

> **Execution rule:** Implement this plan with TDD, one small unit at a time. Do not merge the feature branch or deploy new Phase 2 application code to Production without explicit owner approval. The project intentionally uses the existing Supabase project as schema needs arise; meaningful DDL still stops for explicit owner approval before application.

**Goal:** Turn the protected `/admin` into a usable order and production operations panel without giving the administrator arbitrary payment mutation or weakening checkout, Mercado Pago, Supabase, or admin-auth boundaries.

**Architecture:** Reads and writes remain separate. Admin reads use a dedicated backend-only repository. The list uses one bounded static SQL RPC returning `{orders,total}`. Fulfillment writes use narrow POST routes whose target status is wired on the server, never supplied by the browser. A service-role-only Postgres RPC locks the order and atomically performs the allowed fulfillment transition, order event, admin audit, and any required attention state. Mercado Pago remains authoritative for payment state.

**Visual model:** Reuse the current light/white-card/violet responsive admin style. Add a shared protected-content shell without moving `/admin/login`, `/admin/mfa`, or `/admin/setup-mfa`.

**Phase 1 dependencies already present and validated:**

- `orders.fulfillment_status`;
- `order_events`;
- `order_attention_flags`;
- append-only `admin_audit_log`;
- `lib/server/fulfillment.ts`;
- `lib/server/order-events.ts`;
- `lib/server/order-attention.ts`;
- `lib/server/admin-audit.ts`;
- mandatory admin AAL2 + active server-side admin session.

**Phase 1 privilege evidence:** `service_role` has SELECT/INSERT but no UPDATE/DELETE on `admin_audit_log`; `order_events` likewise has no service-role UPDATE/DELETE. Keep that append-only boundary intact.

**Known environment blocker:** preview environment currently lacks `NEXT_PUBLIC_SUPABASE_URL`. Protected Preview routes cannot be accepted until the Preview admin-auth environment contract is configured. This is a configuration blocker, not a Phase 1/2 code defect.

---

## 0. Non-negotiable Phase 2 invariants

- Payment status remains Mercado Pago/provider-authoritative.
- No admin UI/API sets `payment_status`, `payment_id`, or `payment_status_detail`, and there is no local “mark paid/refunded” action.
- Browser requests never supply an arbitrary fulfillment target.
- Every fulfillment write re-authorizes AAL2 + the active admin session server-side.
- Every fulfillment write is POST-only and same-origin protected.
- Transition + event + audit + required attention mutation are one database transaction.
- The transition RPC locks the order row before evaluating current payment/fulfillment state.
- Normal production transitions are one-click; cancellation requires explicit destructive confirmation.
- Canceling a paid order never implies or performs a refund. Payment remains unchanged and a critical `canceled_paid_order` attention flag opens.
- Once Mercado Pago later confirms a real reversal (`refunded` or `charged_back`), `canceled_paid_order` is resolved automatically; the reversal-specific attention from the payment flow remains truthful.
- Existing `orders.items` remains immutable purchase truth.
- List/detail DTOs exclude `public_token`, `checkout_fingerprint`, `checkout_url`, raw `shipping_snapshot`, credentials, secrets, OAuth tokens, and unrelated internals.
- No broad generic order PATCH endpoint is introduced.
- No shipping-label purchase/generation enters Phase 2.
- No customer-account or catalog-authority work enters Phase 2.
- Unknown future Mercado Pago status strings may be displayed safely with a neutral badge; UI rendering must not crash because a provider introduced a new status.

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

Prefer server components for shell/navigation/status rendering. Only the destructive confirmation component should become a client component if interaction requires it.

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

Route modules export only valid App Router exports (`POST`, `runtime`, etc.). Handler factories stay under `lib/server/`.

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

Do not add unrelated abstractions merely to make the implementation more generic.

---

# Task 1 — RED: define the Phase 2 database contract

**Create only:** `tests/admin-order-operations-migration.test.ts`

The Phase 2 migration must not exist when RED is captured.

## 1.1 Migration existence/additive safety

The test reads:

`supabase/migrations/202609020002_admin_order_fulfillment_operations.sql`

Initial expected RED: missing file (`ENOENT`).

The eventual contract rejects:

- destructive drop/delete of existing order data;
- any admin payment-state writer;
- any browser grant to the new admin RPCs;
- any change that makes fulfillment directly browser-writable;
- fabricated historical order events.

## 1.2 `admin_list_orders` contract

Require one bounded function:

```text
public.admin_list_orders(
  p_query text,
  p_payment_status text,
  p_fulfillment_status text,
  p_attention_required boolean,
  p_from_date date,
  p_to_date date,
  p_sort text,
  p_limit integer,
  p_offset integer
) -> jsonb
```

The exact SQL may use defaults, but the argument names/types remain stable once tests are GREEN.

Required behavior:

- static SQL only; no dynamic SQL concatenation;
- `p_limit` between 1 and 50;
- `p_offset >= 0` and bounded to a reasonable maximum to prevent pathological deep scans;
- `p_sort` allowlist only: `newest | oldest`;
- optional fulfillment status must be in the approved vocabulary;
- optional payment filter is an exact safe code value, not executable SQL; TypeScript additionally length/pattern-validates it;
- search treats `%`, `_`, and `\` as literal input rather than user-controlled wildcard expansion, then matches order number, customer name, or WhatsApp;
- date filters are calendar dates interpreted using `America/Sao_Paulo` boundaries:
  - from = inclusive local midnight;
  - to = exclusive midnight after the chosen local date;
- attention filter uses `exists` against unresolved `order_attention_flags`;
- `open_attention_count` counts unresolved flags;
- `open_attention_severity` is deterministic with priority `critical > warning > info`;
- deterministic order includes `created_at` and `id` tie-breaker;
- backend-only/service-role-only execute;
- fixed/empty search path and fully qualified objects;
- no raw PII beyond the approved admin list fields.

The function returns one JSON object even when the requested page is empty:

```json
{
  "orders": [],
  "total": 0
}
```

This avoids the `count(*) over()` empty-page problem where an offset past the last row would lose the real total.

Approved list row fields:

```text
id
order_number
customer_name
whatsapp
subtotal_cents
total_cents
payment_status
fulfillment_status
created_at
updated_at
open_attention_count
open_attention_severity
```

Do not include `payment_status_detail`, `public_token`, checkout URL/fingerprint, raw provider snapshots, or secrets in the list response.

## 1.3 `admin_transition_order_fulfillment` contract

Require:

```text
public.admin_transition_order_fulfillment(
  p_order_id uuid,
  p_admin_user_id uuid,
  p_target_status text
) -> jsonb
```

Required transaction behavior:

1. `SELECT ... FOR UPDATE` the order.
2. Missing order -> `not_found`.
3. Current state equals target -> `unchanged` with no duplicate event/audit.
4. Validate exactly:
   - `awaiting_payment -> canceled`
   - `awaiting_production -> in_production | canceled`
   - `in_production -> ready_to_ship | canceled`
   - `ready_to_ship -> shipped | canceled`
   - `shipped -> completed`
   - no transition from `completed` or `canceled`.
5. `awaiting_production -> in_production` requires `payment_status='approved'`.
6. On success update only fulfillment state; the existing `set_orders_updated_at` trigger remains the canonical `updated_at` mechanism.
7. Insert exactly one `order_events` `fulfillment_status_changed` row with source `admin`.
8. Insert exactly one `admin_audit_log` row in the same transaction.
9. If target is `canceled` while payment is `approved`, open critical `canceled_paid_order`; do not modify payment.
10. Any failure while writing event/audit/attention rolls back the state transition.

Required outcomes:

```text
transitioned
unchanged
not_found
invalid_transition
payment_precondition_failed
```

Strict result shape:

```json
{
  "outcome": "...",
  "order_id": "uuid|null",
  "order_number": "PB-...|null",
  "payment_status": "...|null",
  "previous_fulfillment_status": "...|null",
  "fulfillment_status": "...|null"
}
```

The RPC accepts no payment mutation fields and calls no external provider.

## 1.4 Event/audit mapping

Event dedupe key:

```text
admin-fulfillment:<order_id>:<from>:<to>
```

Stable DB-derived audit action mapping:

```text
in_production -> production_started
ready_to_ship -> marked_ready_to_ship
shipped -> marked_shipped
completed -> marked_completed
canceled -> order_canceled
```

Audit values:

```json
previous_values: {"fulfillment_status":"..."}
new_values: {"fulfillment_status":"..."}
```

No browser-supplied action labels are stored as audit truth.

## 1.5 Reversal lifecycle for paid cancellation

The Phase 2 migration must add a small database-side observer (trigger/function or equally atomic database mechanism) that **only** resolves an unresolved `canceled_paid_order` attention row when `orders.payment_status` actually changes to `refunded` or `charged_back`.

Requirements:

- it never changes `payment_status`;
- it never changes fulfillment state;
- it resolves only `canceled_paid_order`, not all attention;
- `payment_refunded` / `payment_charged_back` attention created by the Mercado Pago RPC remains unaffected;
- checkout transitions such as `pending`/`checkout_error` do not resolve it.

This keeps attention truthful after the provider confirms money was reversed without duplicating Mercado Pago authority.

## 1.6 RED command

```bash
node --experimental-strip-types --test tests/admin-order-operations-migration.test.ts
```

Expected: fail solely because the migration does not exist.

Record exact RED commit/output in Master Plan + CURRENT_STATUS before writing SQL.

Test-only commit:

```text
test: define admin order operations migration
```

---

# Task 2 — GREEN: Phase 2 migration

**Create:** `supabase/migrations/202609020002_admin_order_fulfillment_operations.sql`

## 2.1 Implement `admin_list_orders`

Use CTEs/static SQL to compute filtered total and paginated JSON array independently, so an empty page still returns the real `total`.

Use:

- service-role-only execute;
- fixed/empty search path;
- fully qualified tables;
- validated sort allowlist;
- escaped literal search pattern;
- explicit `America/Sao_Paulo` day boundaries;
- bounded limit/offset;
- deterministic attention severity.

## 2.2 Implement `admin_transition_order_fulfillment`

Keep the full transition matrix visibly encoded in SQL. TypeScript helpers are UX/preflight only; the locked database row is the concurrency authority.

Use the deterministic event dedupe key. If a retry finds the order already at target, return `unchanged` before event/audit insertion.

## 2.3 Implement paid-cancellation lifecycle

When successful target is `canceled` and locked payment state is `approved`:

- open `canceled_paid_order` with severity `critical`, source `admin`;
- metadata contains only safe context such as current payment status;
- do not call Mercado Pago and do not alter payment fields.

Add the narrow database reversal observer described in Task 1.5 to resolve that cancellation-specific attention only after actual `refunded`/`charged_back` state.

## 2.4 Focused GREEN

```bash
node --experimental-strip-types --test tests/admin-order-operations-migration.test.ts
```

Then regression:

```bash
node --experimental-strip-types --test \
  tests/admin-order-foundation-migration.test.ts \
  tests/payment-rpc-contract.test.ts \
  tests/orders-payment-rpc.test.ts \
  tests/fulfillment.test.ts
```

Expected: zero failures.

Commit:

```text
feat: add atomic admin fulfillment operations
```

Do **not** apply Phase 2 DDL to Supabase yet. Application waits until the full Phase 2 code candidate is tested/re-reviewed and the owner explicitly approves the exact migration.

---

# Task 3 — RED/GREEN: admin read repository

**Create:**

- `tests/admin-orders-repository.test.ts`
- `lib/server/admin-orders.ts`

## 3.1 List contract

```ts
listAdminOrders({
  query?,
  paymentStatus?,
  fulfillmentStatus?,
  attentionRequired?,
  from?,
  to?,
  sort?,
  page?,
  pageSize?,
})
```

Rules/tests:

- default page 1, page size 25, sort `newest`;
- page/pageSize safe integers and bounded before fetch;
- query trimmed and max-length bounded;
- payment filter optional, exact-match, max 100, safe status-code pattern only;
- fulfillment filter uses `isFulfillmentStatus`;
- `from`/`to` are strict `YYYY-MM-DD`, with `from <= to`;
- sort only `newest | oldest`;
- call only `rpc/admin_list_orders` with exact argument names;
- strict response parser requires `{orders:Array,total:nonnegative-safe-integer}`;
- each list row gets shape/type validation;
- return `{orders,total,page,pageSize}`;
- no browser Supabase client.

Unknown payment status values stored by Mercado Pago are valid **display data**. The repository's filter syntax validation prevents malformed codes, not future provider vocabulary.

## 3.2 Detail contract

```ts
getAdminOrderById(orderId)
```

Canonical UUID only. Dedicated safe select list.

Allowed detail fields:

```text
id
order_number
customer_name
whatsapp
cep
address_street
address_number
address_complement
address_neighborhood
address_city
address_state
items
subtotal_cents
shipping_provider
shipping_service_id
shipping_service_name
shipping_carrier_name
shipping_delivery_days
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

Explicitly excluded:

```text
public_token
checkout_attempt_id
checkout_fingerprint
checkout_url
shipping_snapshot
server/provider credentials
```

`items` is the immutable order snapshot and may be shown to the admin.

## 3.3 Implementation pattern

Reuse `getSupabaseEnv()`, no-store requests, bounded timeout, sanitized storage errors. This module is read-only and exposes no generic PATCH.

Run:

```bash
node --experimental-strip-types --test tests/admin-orders-repository.test.ts
```

Commit:

```text
feat: add admin order read repository
```

---

# Task 4 — RED/GREEN: strict transition repository

**Create:**

- `tests/admin-order-operations.test.ts`
- `lib/server/admin-order-operations.ts`

Expose only server-side:

```ts
transitionAdminOrderFulfillment({ orderId, adminUserId, targetStatus })
```

Tests require:

- canonical order/admin UUIDs;
- known fulfillment target;
- exact path `rpc/admin_transition_order_fulfillment`;
- exact argument names;
- strict result union parser;
- sanitized network/storage errors;
- no provider body/secret logging.

TypeScript may reject malformed target values, but it does not decide whether the current transition is valid. SQL row locking is final authority.

Run:

```bash
node --experimental-strip-types --test tests/admin-order-operations.test.ts
```

Commit:

```text
feat: add admin fulfillment repository
```

---

# Task 5 — RED/GREEN: narrow POST action handlers

**Create:**

- `tests/admin-order-actions.test.ts`
- `lib/server/admin-order-actions.ts`
- the five narrow route modules.

## 5.1 Server-wired target

Handler factory receives a fixed target:

```ts
createAdminOrderActionHandler({
  targetStatus: "in_production",
  authorizeAdmin,
  transitionOrder,
})
```

The route file fixes the target. Request body/query cannot override it.

## 5.2 Request order

Tests require:

1. resolve/check site/request origin;
2. cross-site Origin -> 403 before admin/storage work;
3. `authorizeAdminAccess({ touch: true })`;
4. await Next.js 16 dynamic route `params` and validate canonical order UUID;
5. pass `principal.userId` as `adminUserId`;
6. execute transition RPC;
7. map outcome.

Never accept an admin UUID from the browser.

## 5.3 Fixed result mapping

Use one HTML-form-friendly policy; do not leave two options to the implementer:

- `transitioned` -> 303 `/admin/pedidos/<id>?status=updated`;
- `unchanged` -> 303 `?status=unchanged`;
- `invalid_transition` -> 303 `?status=invalid-transition`;
- `payment_precondition_failed` -> 303 `?status=payment-required`;
- `not_found` -> 404;
- unavailable auth/storage -> 503;
- authenticated wrong admin -> 403;
- unauthenticated/MFA/session failure -> 401.

All responses are private/no-store. Query feedback values are a hardcoded allowlist; never echo provider/database error text.

## 5.4 Cancellation

Backend cancellation is the same atomic RPC with target `canceled`. The only special client behavior is destructive confirmation. No payment fields are accepted.

## 5.5 Route export safety

Every `route.ts` exports only supported App Router route exports. Factory/helper code remains in `lib/server/admin-order-actions.ts`.

Run:

```bash
node --experimental-strip-types --test tests/admin-order-actions.test.ts
```

Commit:

```text
feat: add narrow admin order actions
```

---

# Task 6 — RED/GREEN: shared protected admin shell

**Create/change:**

- `components/admin/admin-shell.tsx`
- `components/admin/admin-nav.tsx`
- `components/admin/status-badge.tsx`
- `app/admin/page.tsx`
- `app/admin/integrations/melhor-envio/page.tsx`
- `tests/admin-auth-ui.test.ts`
- shell coverage in `tests/admin-orders-ui.test.ts`.

## 6.1 Auth routes stay separate

Do not move:

```text
/admin/login
/admin/mfa
/admin/setup-mfa
```

Do not add a route-group migration merely for layout aesthetics.

## 6.2 Shell

Render:

- ProxyBembem admin brand;
- current section title/description;
- responsive navigation;
- logout POST form;
- content container.

Live Phase 2 entries only:

```text
Visão geral -> /admin
Pedidos -> /admin/pedidos
Produção -> /admin/producao
Integrações -> /admin/integrations/melhor-envio
```

Pass an `activeSection`/equivalent server prop rather than requiring `usePathname` only to style navigation. Mobile must not horizontally overflow.

Each protected page continues:

```ts
await requireAdminPageAccess({ touch: true })
```

No background polling in the shell. Existing Melhor Envio URL/form action stays unchanged.

`status-badge.tsx` maps known payment/fulfillment states to readable Portuguese labels and uses a safe neutral fallback for unknown payment statuses.

Run relevant auth/UI tests and commit:

```text
feat: add shared admin shell
```

---

# Task 7 — RED/GREEN: `/admin/pedidos`

**Create:** `app/admin/pedidos/page.tsx`; extend `tests/admin-orders-ui.test.ts`.

## 7.1 Server URL filters

Next.js 16 page `searchParams` is awaited. Supported params:

```text
q
payment
fulfillment
attention
from
to
page
```

The page uses `sort='newest'`. Normalize through a tested pure parser if the page becomes cluttered.

Malformed values are rejected/fallback safely; no arbitrary SQL fragments reach storage.

## 7.2 UI

Each row/card shows:

- order number;
- customer name;
- local date/time;
- total (`total_cents` with safe legacy fallback to subtotal if necessary);
- payment badge;
- fulfillment badge;
- attention count/highest severity;
- detail link.

Desktop: readable table/list card. Mobile: stacked cards, no tiny horizontal finance table.

No payment mutation action/copy such as “Marcar como pago”, “Aprovar pagamento”, “Forçar status”, or local refund.

## 7.3 Pagination

Server page size 25, max 50. Previous/next preserve active filters. Never fetch all orders to paginate in React.

Tests require protected access, server repository use, filter handling, safe DTO fields, badges, detail links, and absence of forbidden payment actions/internals.

Commit:

```text
feat: add admin orders list
```

---

# Task 8 — RED/GREEN: `/admin/pedidos/[id]`

**Create:** `app/admin/pedidos/[id]/page.tsx`; extend `tests/admin-orders-ui.test.ts`.

## 8.1 Data flow

- await Next.js 16 `params`;
- validate/load the order first with `getAdminOrderById(id)`;
- missing order -> `notFound()`;
- then load history in parallel:

```ts
Promise.all([
  listOrderEvents(id),
  listOpenOrderAttention(id),
  listAdminAuditForEntity({ entityType: "order", entityId: id }),
])
```

Do not query unrelated entity audit history.

## 8.2 Sections

1. order summary;
2. fulfillment actions;
3. open attention;
4. purchased item snapshot;
5. customer/WhatsApp;
6. delivery address;
7. safe shipping fields;
8. Mercado Pago read-only identifiers/status/detail;
9. operational timeline;
10. admin audit history.

Never render raw `shipping_snapshot`, public token, checkout fingerprint, or checkout URL.

## 8.3 Action matrix

UI uses `allowedAdminFulfillmentTransitions` only to decide which controls to render; DB revalidates under lock.

```text
awaiting_payment -> Cancelar
awaiting_production -> Iniciar produção | Cancelar
in_production -> Marcar pronto para envio | Cancelar
ready_to_ship -> Marcar enviado | Cancelar
shipped -> Marcar concluído
completed -> none
canceled -> none
```

If an awaiting-production order somehow lacks approved payment, show warning and no enabled start-production control.

## 8.4 Cancellation copy

Confirmation explicitly states:

- the operational order will be canceled;
- this does not automatically refund Mercado Pago;
- if already paid, financial follow-up remains until provider reversal is confirmed.

## 8.5 Safe redirect feedback

Hardcoded messages only for:

```text
updated
unchanged
invalid-transition
payment-required
```

Never echo arbitrary query text.

Commit:

```text
feat: add admin order detail
```

---

# Task 9 — RED/GREEN: destructive confirmation

**Create:** `components/admin/danger-confirm-form.tsx`; extend UI tests.

Use the already installed Radix dialog primitive (or equivalent existing accessible primitive); do not add a dependency solely for this.

Safe props only:

```text
action URL
button label
title
description
confirm label
```

Tests prove:

- cancellation requires confirmation;
- form remains POST;
- ordinary production transitions do not use destructive confirmation;
- opening the dialog does not submit;
- client component contains no server/admin/payment secrets.

Commit:

```text
feat: confirm destructive admin actions
```

---

# Task 10 — RED/GREEN: `/admin/producao`

**Create:** `app/admin/producao/page.tsx`, `tests/admin-production-ui.test.ts`.

Show exactly three operational queues:

```text
Aguardando produção
Em produção
Pronto para envio
```

Call `listAdminOrders` three times with fixed fulfillment filters, `sort:'oldest'`, page size/max 50. The SQL RPC supports this allowlisted sort from the start; do not client-sort a full history.

Each card shows only operational summary:

- order number;
- customer;
- creation date;
- total;
- payment badge;
- attention indicator;
- link to detail.

Do not duplicate full address/payment IDs. Do not load completed/canceled history into this page.

Commit:

```text
feat: add production queue
```

---

# Task 11 — Full verification before Phase 2 DDL application

## 11.1 Focused suite

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

## 11.2 Exact candidate gates

```bash
pnpm test
pnpm typecheck
pnpm build
```

All must pass in GitHub CI on the exact candidate SHA.

## 11.3 Scope review

Allowed Phase 2 runtime scope only:

```text
one additive Phase 2 migration
admin read/operation/action server modules
shared admin shell components
orders list/detail/production pages
five narrow fulfillment POST routes
relevant tests/checkpoint docs
```

Reject customer account, catalog authority, label spending, email provider, hosting, or unrelated refactors.

## 11.4 Security/concurrency review

Verify explicitly:

- no browser payment mutation;
- no browser admin UUID;
- no browser arbitrary target;
- mutation routes same-origin + AAL2 active-admin authorized;
- dynamic route params awaited/validated;
- route modules export no factories;
- list/detail exclude public/checkout internals;
- transition/event/audit/attention are one DB transaction;
- row locking handles concurrent payment/fulfillment events correctly;
- paid cancellation creates attention and does not alter provider payment state;
- later real reversal resolves only the cancellation-specific attention;
- audit/event append-only privileges remain intact.

Checkpoint docs are updated only with evidence that actually exists.

---

# Task 12 — Apply/validate Phase 2 migration on current Supabase

The owner explicitly chose the established in-place Supabase workflow. Do not create a paid development branch as a prerequisite.

**STOP before this task and obtain explicit owner approval for the exact Phase 2 migration candidate.** This is meaningful Production database DDL even though it is compatibility-safe.

## 12.1 Re-read exact SQL

Confirm:

- additive/non-destructive;
- no payment admin writer;
- service-role-only RPC grants;
- fixed/empty search paths;
- row lock and transition matrix;
- static list SQL;
- event/audit transaction coupling;
- paid-cancel attention lifecycle;
- no fabricated history.

## 12.2 Apply with migration tooling

Record only project label, migration name/version, and success/failure. Never record credentials/PII.

## 12.3 Safe structural validation

Verify function/trigger existence, grants, security-definer/search-path properties, and append-only table privileges.

## 12.4 Controlled transaction + rollback

Temporary orders only; rollback all fixtures. Prove:

```text
awaiting_payment -> canceled succeeds
awaiting_payment -> in_production rejects
awaiting_production + approved -> in_production succeeds
same target retry -> unchanged; no duplicate event/audit
in_production -> ready_to_ship succeeds
ready_to_ship -> shipped succeeds
shipped -> completed succeeds
completed -> transition rejects
paid cancel keeps payment approved + opens canceled_paid_order
paid canceled -> actual refunded resolves canceled_paid_order, keeps refund-specific attention
paid canceled -> actual charged_back resolves canceled_paid_order, keeps chargeback-specific attention
checkout_error/pending change does not resolve canceled_paid_order
nonexistent id -> not_found
```

Prove 0 persistent test orders afterward.

## 12.5 Advisors

Re-run Supabase security/performance advisors. Classify intentional backend-only RLS and fresh-index notices rather than mechanically changing architecture.

---

# Task 13 — Preview acceptance

Phase 2 cannot be Preview-approved while the known preview environment admin-auth environment problem exists.

## 13.1 Required Preview admin-auth contract

Verify presence, without printing secret values:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ADMIN_USER_ID
SUPABASE_URL
SUPABASE_SECRET_KEY
```

Existing integration routes may additionally require their already documented provider/rate-limit variables.

The currently connected previous hosting provider management tool cannot edit env vars. If still true at execution time, configure them through previous hosting provider settings or another authorized management path; never commit values.

## 13.2 Preview smoke matrix

After env configuration and READY deployment:

```text
/ -> 200
/admin unauthenticated -> login surface
password + MFA -> protected shell
/admin/pedidos -> bounded list
search/filter/date/pagination -> expected results
empty/out-of-range page -> correct total/no crash
/admin/pedidos/<id> -> safe detail
normal transition -> state + event + audit
stale/invalid transition -> safe redirect feedback
paid cancellation -> confirmation + no payment mutation
/admin/producao -> three oldest-first queues
/admin/integrations/melhor-envio -> existing route still works
public storefront/order tracking -> no regression
```

Do not perform a real Mercado Pago payment or real Melhor Envio label purchase merely for this phase.

Review Preview error/fatal logs after smoke tests.

---

# Task 14 — Phase 2 completion gate

Phase 2 is complete only when:

- every new migration/server/UI unit has RED -> GREEN evidence;
- focused suite passes;
- exact candidate `pnpm test`, `pnpm typecheck`, `pnpm build` pass in CI;
- exact diff/security review passes;
- Phase 2 migration is separately owner-approved, applied, and transaction-tested on current Supabase;
- no fixture rows remain;
- Preview protected admin environment is configured;
- list/detail/production smoke matrix passes;
- payment remains provider-authoritative;
- storefront/public order tracking regressions are absent;
- Master Plan + CURRENT_STATUS record exact final evidence;
- merge/new Production application deployment remains a separate explicit owner decision.

**Next phase:** write/review `docs/superpowers/plans/2026-09-02-customer-account-orders.md` before customer-account runtime work.

---

## Phase 2 session checkpoint template

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
- Mercado Pago is payment authority
- browser never chooses arbitrary fulfillment target
- fulfillment/event/audit/required-attention are atomic in DB
- paid cancellation does not refund; it opens attention
- actual reversal resolves canceled_paid_order only
- no generic admin order/payment PATCH
- list RPC returns {orders,total} even for empty pages
- admin date filters use America/Sao_Paulo calendar boundaries
- Preview env blocker remains visible until fixed
- no paid Supabase dev branch is required by project workflow
```
