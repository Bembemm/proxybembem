# ProxyBembem Phase 3 — Customer Account + Owned Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Supabase customer accounts, require an email on every new checkout, link authenticated purchases to the trusted customer UUID, and let verified customers securely view/claim only their own orders without weakening guest checkout or admin/payment boundaries.

**Architecture:** Customer identity uses the existing Supabase Auth installation but a separate customer authorization module; admin authorization remains UUID allowlist + AAL2 + `admin_sessions`. New orders persist a normalized email snapshot and optional immutable Auth UUID relationship. Customer order reads use narrow database RPCs that derive ownership from `auth.uid()` and return curated JSON rather than granting broad browser access to `orders`. Guest-order claiming is a separate service-role-only atomic RPC and requires both a verified account email and the existing 64-character public order token.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Supabase Auth + SSR, Supabase/Postgres, existing service-role REST helpers, Node test runner, GitHub Actions, Vercel Preview.

**Spec:** `docs/superpowers/specs/2026-09-01-admin-dashboard-expansion-design.md`

## Global Constraints

- Checkout account creation remains optional; guest checkout remains supported.
- **Approved 2026-09-02 clarification:** email is mandatory for every new checkout, including guest checkout.
- Existing historical orders must not receive fabricated email/customer ownership. Their new email/customer columns remain `NULL` until truthfully populated by a future explicit safe operation.
- Supabase Auth email is the unique account identity; names are never unique identifiers.
- Customer authorization is separate from admin authorization. A normal authenticated customer must never satisfy `authorizeAdminAccess` merely because a Supabase session exists.
- Authenticated checkout links an order only to the trusted Supabase Auth UUID returned server-side. The browser never submits a trusted `customer_id`.
- For authenticated checkout, the persisted order email is the canonical normalized email from the authenticated Supabase user; a mismatching browser email is rejected rather than silently relinking identity.
- Guest claiming requires **verified email + secure public order token**. Email-only, name-only, WhatsApp-only, order-number-only, or bulk automatic claiming is forbidden.
- Historical orders with `customer_email IS NULL` are not claimable in this phase; their existing public-token tracking remains valid.
- Existing `/pedido/[token]` guest tracking remains supported after an order is linked to an account.
- Customer-facing DTOs never expose `public_token`, checkout attempt/fingerprint/URL, raw shipping snapshot, Mercado Pago internals not meant for customers, admin audit data, provider credentials, TOTP/admin secrets, or service-role material.
- `orders.items` remains immutable purchase truth.
- Mercado Pago remains authoritative for payment status; customer-account work never writes provider financial state.
- Transactional order-status emails are Phase 6. Phase 3 uses only Supabase Auth's verification/password-recovery email mechanisms.
- No catalog authority switch, Melhor Envio label purchase, automated WhatsApp, merge, or new Production application deployment belongs to this phase.
- Meaningful DDL on the current Supabase project still stops for explicit owner approval before application.

---

## File map

### New migration

- `supabase/migrations/202609020003_customer_accounts_orders.sql`

### New server modules

- `lib/server/customer-auth.ts` — trusted optional/required customer identity resolution.
- `lib/server/customer-profiles.ts` — own-profile read/create/update through the authenticated Supabase server client.
- `lib/server/customer-orders.ts` — wrappers for customer-owned list/detail RPCs.
- `lib/server/customer-order-claim.ts` — service-role-only atomic guest-order claim wrapper.
- `lib/server/customer-account-actions.ts` — same-origin/rate-limited auth/profile/password/claim HTTP handler factories where useful.

### New customer auth/account routes

- `app/entrar/page.tsx`
- `app/criar-conta/page.tsx`
- `app/esqueci-a-senha/page.tsx`
- `app/auth/callback/route.ts`
- `app/minha-conta/page.tsx`
- `app/minha-conta/pedidos/page.tsx`
- `app/minha-conta/pedidos/[id]/page.tsx`
- `app/minha-conta/perfil/page.tsx`
- `app/minha-conta/seguranca/page.tsx`
- `app/api/account/signup/route.ts`
- `app/api/account/login/route.ts`
- `app/api/account/logout/route.ts`
- `app/api/account/password-reset/route.ts`
- `app/api/account/password/route.ts`
- `app/api/account/profile/route.ts`
- `app/api/account/orders/claim/route.ts`

### New shared customer UI

- `components/account/account-shell.tsx`
- `components/account/account-nav.tsx`
- `components/account/auth-form.tsx`
- `components/account/customer-status-badge.tsx`
- `components/account/order-claim-form.tsx`

### Existing files expected to change

- `lib/checkout.ts`
- `components/checkout-form.tsx`
- `components/cart-panel.tsx`
- `app/api/checkout/route.ts`
- `lib/server/checkout-flow.ts`
- `lib/server/checkout-idempotency.ts`
- `lib/server/orders.ts`
- `lib/server/admin-orders.ts` — add customer email to safe admin detail only.
- `app/admin/pedidos/[id]/page.tsx` — display email snapshot when present.
- `app/pedido/[token]/page.tsx` — optional safe claim entry point while preserving public tracking.
- `proxy.ts` — refresh Supabase session for customer/account/auth callback surfaces.
- `lib/server/rate-limit.ts` — add bounded account scopes.
- `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`
- `docs/superpowers/CURRENT_STATUS.md`

### New tests

- `tests/customer-account-migration.test.ts`
- `tests/checkout-email.test.ts`
- `tests/customer-auth.test.ts`
- `tests/customer-profile.test.ts`
- `tests/customer-orders.test.ts`
- `tests/customer-order-claim.test.ts`
- `tests/customer-account-actions.test.ts`
- `tests/customer-account-ui.test.ts`
- `tests/customer-account-security.test.ts`

Existing checkout/order/admin/auth tests must remain regression gates.

---

# Task 1 — RED: define the Phase 3 database contract

**Create only:** `tests/customer-account-migration.test.ts`

**Interfaces:**
- Consumes existing `orders`, `order_events`, Supabase `auth.users`, and Phase 1/2 security boundaries.
- Produces the schema/RPC contract all later Phase 3 tasks depend on.

- [ ] **Step 1: write the failing migration contract test**

The test must read `supabase/migrations/202609020003_customer_accounts_orders.sql` and require all of the following:

```ts
const migrationPath = "supabase/migrations/202609020003_customer_accounts_orders.sql"
const sql = readFileSync(migrationPath, "utf8")
assert.match(sql, /add column if not exists customer_email text/i)
assert.match(sql, /add column if not exists customer_id uuid/i)
assert.match(sql, /create table if not exists public\.customer_profiles/i)
assert.match(sql, /create or replace function public\.customer_list_orders/i)
assert.match(sql, /create or replace function public\.customer_get_order/i)
assert.match(sql, /create or replace function public\.claim_guest_order_for_customer/i)
```

Also reject destructive/history-fabricating patterns and require:

- no `UPDATE orders SET customer_email = ...` backfill;
- no `UPDATE orders SET customer_id = ...` backfill;
- no broad `GRANT SELECT ON public.orders TO authenticated`;
- `customer_list_orders` / `customer_get_order` derive ownership from `auth.uid()`;
- customer RPC output never includes `public_token`, checkout fingerprint/URL/attempt, `shipping_snapshot`, or `admin_audit_log`;
- claim RPC is denied to `anon` and `authenticated`, granted only to `service_role`;
- customer profile table has RLS and own-row policies;
- `orders.customer_id` references `auth.users(id)` and is indexed;
- `customer_email` remains nullable for historical compatibility.

- [ ] **Step 2: run RED**

```bash
node --experimental-strip-types --test tests/customer-account-migration.test.ts
```

Expected: FAIL only because `202609020003_customer_accounts_orders.sql` does not exist.

- [ ] **Step 3: record exact RED evidence** in Master Plan + CURRENT_STATUS.

- [ ] **Step 4: commit test only**

```bash
git add tests/customer-account-migration.test.ts docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md docs/superpowers/CURRENT_STATUS.md
git commit -m "test: define customer account database contract"
```

---

# Task 2 — GREEN: additive customer/account migration

**Create:** `supabase/migrations/202609020003_customer_accounts_orders.sql`

**Interfaces:**
- Produces `orders.customer_email`, `orders.customer_id`, `customer_profiles`, customer list/detail RPCs, and service-role claim RPC.

- [ ] **Step 1: add compatibility-safe order ownership columns**

Use additive SQL equivalent to:

```sql
alter table public.orders
  add column if not exists customer_email text,
  add column if not exists customer_id uuid references auth.users(id) on delete set null;

create index if not exists orders_customer_id_created_idx
  on public.orders (customer_id, created_at desc)
  where customer_id is not null;
```

Add a nullable-email constraint requiring trimmed lowercase storage, maximum 254 characters, no whitespace, and a basic `local@domain` shape when not null. Do **not** set `NOT NULL` and do not invent values for old rows.

- [ ] **Step 2: create minimal permanent profile**

```sql
create table if not exists public.customer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 3 and 100),
  whatsapp text not null check (whatsapp ~ '^\d{10,11}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Enable RLS. `authenticated` may SELECT/INSERT/UPDATE only where `id = auth.uid()`. Do not grant DELETE. Keep email authoritative in Supabase Auth rather than duplicating a mutable account email in this table.

- [ ] **Step 3: add customer-owned list RPC**

```text
public.customer_list_orders(p_limit integer, p_offset integer) -> jsonb
```

Requirements:

- authenticated-only;
- `auth.uid()` must be non-null;
- `p_limit` 1..50, `p_offset >= 0` and bounded;
- fixed/empty search path + fully qualified tables;
- filters only `orders.customer_id = auth.uid()`;
- returns `{orders,total}` even for empty/out-of-range pages;
- summary fields only: `id`, `order_number`, totals, `payment_status`, `fulfillment_status`, `created_at`, shipping service/carrier/delivery days;
- no public token/provider/internal checkout fields.

- [ ] **Step 4: add customer-owned detail RPC**

```text
public.customer_get_order(p_order_id uuid) -> jsonb
```

Return `null` for missing/not-owned to avoid existence disclosure. Safe detail fields:

```text
id, order_number, items, subtotal_cents, shipping_cents, total_cents,
payment_status, fulfillment_status, created_at, updated_at,
shipping_service_name, shipping_carrier_name, shipping_delivery_days,
customer_name, whatsapp, customer_email,
address_street, address_number, address_complement,
address_neighborhood, address_city, address_state
```

Include a curated customer timeline generated with SQL `CASE` from `order_events`, returning only `{kind,created_at}`. Never return raw event metadata. Allowed timeline kinds are bounded customer-safe values such as `payment_approved`, `payment_reversed`, `production_started`, `ready_to_ship`, `shipped`, `completed`, `canceled`.

- [ ] **Step 5: add atomic guest claim RPC**

```text
public.claim_guest_order_for_customer(
  p_public_token text,
  p_customer_id uuid,
  p_verified_email text
) -> jsonb
```

Rules:

1. service-role-only execute;
2. validate 64 hex token, UUID, normalized email;
3. lock the order `FOR UPDATE` by public token;
4. missing order -> generic `not_claimable`;
5. `customer_email IS NULL` -> `not_claimable` (historical order remains public-token-only);
6. normalized stored email mismatch -> `not_claimable`;
7. `customer_id` already equals caller ID -> `already_claimed` idempotently;
8. `customer_id` belongs to another account -> `not_claimable`;
9. successful claim sets only `customer_id`;
10. insert one `order_events` event with `source='customer'`, `event_type='customer_order_claimed'`, deterministic dedupe key `customer-claim:<order_id>:<customer_id>` and no email/token metadata;
11. return only `{outcome,order_id,order_number}`.

- [ ] **Step 6: run focused GREEN**

```bash
node --experimental-strip-types --test tests/customer-account-migration.test.ts
```

Expected: PASS.

- [ ] **Step 7: run foundation regressions**

```bash
node --experimental-strip-types --test \
  tests/admin-order-foundation-migration.test.ts \
  tests/admin-order-operations-migration.test.ts \
  tests/orders-payment-rpc.test.ts
```

Expected: PASS.

- [ ] **Step 8: commit**

```bash
git add supabase/migrations/202609020003_customer_accounts_orders.sql tests/customer-account-migration.test.ts
git commit -m "feat: add customer account data foundation"
```

**Do not apply this migration to Supabase yet.** Application waits for the full Phase 3 candidate review and explicit owner approval.

---

# Task 3 — RED/GREEN: make checkout email mandatory

**Modify:** `lib/checkout.ts`, `components/checkout-form.tsx`, `components/cart-panel.tsx`, `app/api/checkout/route.ts`, `lib/server/checkout-idempotency.ts`

**Create:** `tests/checkout-email.test.ts`

**Interfaces:**
- `CheckoutData.email: string` becomes required.
- `normalizeCheckoutEmail(value: string): string` returns trimmed lowercase email.

- [ ] **Step 1: write failing tests**

Require:

```ts
const valid: CheckoutData = {
  nome: "Cliente Teste",
  email: " Cliente+Deck@Example.COM ",
  whatsapp: "44999999999",
  cep: "87000000",
  rua: "Rua A",
  numero: "10",
  complemento: "",
  bairro: "Centro",
  cidade: "Maringá",
  uf: "PR",
}
assert.equal(normalizeCheckoutData(valid).email, "cliente+deck@example.com")
assert.equal(validateCheckout(valid).email, undefined)
assert.ok(validateCheckout({ ...valid, email: "invalido" }).email)
```

Also test that checkout fingerprint changes when normalized customer email changes, but case/outer whitespace alone does not change it.

- [ ] **Step 2: run RED**

```bash
node --experimental-strip-types --test tests/checkout-email.test.ts tests/checkout.test.ts tests/checkout-idempotency.test.ts
```

Expected: FAIL because `CheckoutData.email`/validation/UI contract is absent.

- [ ] **Step 3: implement email normalization/validation**

Use maximum 254 characters and a conservative non-whitespace `local@domain` format. Do not attempt full RFC mailbox parsing.

Add `email?: string` to `CheckoutErrors`, add `email` to normalization, and include it in the WhatsApp checkout summary as contact information.

- [ ] **Step 4: add accessible required email field**

`components/checkout-form.tsx` gets `type="email"`, `autoComplete="email"`, max length 254, required visual marker, and field-specific error. `components/cart-panel.tsx` adds `email: ""` to `EMPTY_CHECKOUT` and preserves it through checkout state/reset behavior.

- [ ] **Step 5: require email in the API parser**

Add `email` to the strict `parseCustomer` string field list. Missing/non-string email returns the existing generic customer-data 400; invalid email appears in `fieldErrors.email`.

- [ ] **Step 6: run GREEN/regression**

```bash
node --experimental-strip-types --test \
  tests/checkout-email.test.ts \
  tests/checkout.test.ts \
  tests/checkout-idempotency.test.ts \
  tests/checkout-route.test.ts
```

Expected: PASS.

- [ ] **Step 7: commit**

```bash
git add lib/checkout.ts components/checkout-form.tsx components/cart-panel.tsx app/api/checkout/route.ts lib/server/checkout-idempotency.ts tests/checkout-email.test.ts
git commit -m "feat: require checkout email"
```

---

# Task 4 — RED/GREEN: trusted customer identity resolver

**Create:** `lib/server/customer-auth.ts`, `tests/customer-auth.test.ts`

**Interfaces:**

```ts
export interface CustomerIdentity {
  userId: string
  email: string
  emailVerified: true
}

export async function getOptionalCustomerIdentity(): Promise<CustomerIdentity | null>
export async function requireCustomerPageAccess(): Promise<CustomerIdentity>
```

- [ ] **Step 1: write dependency-injected RED tests**

Test:

- no user -> optional returns `null`;
- user with canonical UUID + verified email -> trusted normalized identity;
- malformed UUID/email -> deny;
- unverified account -> deny protected account access;
- customer auth never checks/uses `ADMIN_USER_ID` and never activates `admin_sessions`;
- page helper redirects unauthenticated/unverified users to `/entrar` rather than `/admin/login`.

- [ ] **Step 2: run RED**

```bash
node --experimental-strip-types --test tests/customer-auth.test.ts
```

Expected: module missing.

- [ ] **Step 3: implement using `createSupabaseServerClient().auth.getUser()`**

Use the network-validated Auth user as identity truth. Account pages require `email_confirmed_at`/verified email. `getOptionalCustomerIdentity()` may return `null` when no trusted user exists; it must never trust request body `customerId`/email as authenticated identity.

- [ ] **Step 4: run GREEN**

```bash
node --experimental-strip-types --test tests/customer-auth.test.ts tests/admin-auth.test.ts
```

Expected: PASS, including existing admin tests.

- [ ] **Step 5: commit**

```bash
git add lib/server/customer-auth.ts tests/customer-auth.test.ts
git commit -m "feat: add customer auth boundary"
```

---

# Task 5 — RED/GREEN: persist email and authenticated ownership at checkout

**Modify:** `lib/server/orders.ts`, `lib/server/checkout-flow.ts`, `app/api/checkout/route.ts`, `lib/server/admin-orders.ts`, `app/admin/pedidos/[id]/page.tsx`

**Test:** extend/create `tests/orders.test.ts`, `tests/checkout-flow.test.ts`, `tests/checkout-route.test.ts`, `tests/admin-orders-repository.test.ts`, `tests/admin-orders-ui.test.ts`.

**Interfaces:**

```ts
CreateOrderInput.customerEmail: string
CreateOrderInput.customerId?: string | null
CheckoutFlowInput.customerIdentity?: CustomerIdentity | null
```

- [ ] **Step 1: RED tests**

Require guest order creation to send:

```json
{"customer_email":"cliente@example.com","customer_id":null}
```

Authenticated checkout must send trusted `customer_id` and canonical account email. A browser email different from the authenticated account email must fail with a validation error before order creation.

- [ ] **Step 2: run RED**

```bash
node --experimental-strip-types --test tests/orders.test.ts tests/checkout-flow.test.ts tests/checkout-route.test.ts
```

- [ ] **Step 3: extend `OrderRecord`/selects/create payload** with nullable `customer_email` and `customer_id`; new checkout always supplies normalized email.

- [ ] **Step 4: resolve optional auth in checkout route**

Call `getOptionalCustomerIdentity()` server-side. Pass the result to `executeCheckoutFlow`; never accept `customer_id` from JSON. Guest continues with `customer_id=null`.

- [ ] **Step 5: enforce authenticated-email match in checkout flow**

If identity exists and normalized `customer.email !== identity.email`, throw `CheckoutFlowValidationError("Authenticated email mismatch")`. Persist `identity.email` and `identity.userId` only after this check.

- [ ] **Step 6: add customer email to safe admin detail**

Admin detail may show `customer_email`; do not expose `customer_id` as an editable field and do not add any admin operation that changes customer ownership.

- [ ] **Step 7: GREEN/regression**

```bash
node --experimental-strip-types --test \
  tests/orders.test.ts \
  tests/checkout-flow.test.ts \
  tests/checkout-route.test.ts \
  tests/admin-orders-repository.test.ts \
  tests/admin-orders-ui.test.ts
```

Expected: PASS.

- [ ] **Step 8: commit**

```bash
git add lib/server/orders.ts lib/server/checkout-flow.ts app/api/checkout/route.ts lib/server/admin-orders.ts app/admin/pedidos/[id]/page.tsx tests
git commit -m "feat: link authenticated checkout orders"
```

---

# Task 6 — RED/GREEN: customer profile repository

**Create:** `lib/server/customer-profiles.ts`, `tests/customer-profile.test.ts`

**Interfaces:**

```ts
export interface CustomerProfile {
  id: string
  name: string
  whatsapp: string
  createdAt: string
  updatedAt: string
}

export async function getOwnCustomerProfile(): Promise<CustomerProfile | null>
export async function ensureOwnCustomerProfile(input: { name: string; whatsapp: string }): Promise<CustomerProfile>
export async function updateOwnCustomerProfile(input: { name: string; whatsapp: string }): Promise<CustomerProfile>
```

Use `createSupabaseServerClient()` with the caller's authenticated session so RLS, not service-role bypass, protects profile ownership.

- [ ] **Step 1: RED tests** verify exact safe fields, name/WhatsApp normalization, no email/password columns written, and no arbitrary profile ID accepted.
- [ ] **Step 2: run RED** with `node --experimental-strip-types --test tests/customer-profile.test.ts`.
- [ ] **Step 3: implement strict parser + RLS-backed read/upsert/update**.
- [ ] **Step 4: run GREEN** plus `tests/customer-auth.test.ts`.
- [ ] **Step 5: commit** as `feat: add customer profile repository`.

---

# Task 7 — RED/GREEN: account auth actions and Supabase callback

**Create:** auth/account API routes, `lib/server/customer-account-actions.ts`, and `tests/customer-account-actions.test.ts`.

**Modify:** `lib/server/rate-limit.ts`, `proxy.ts`.

**Rate-limit scopes:**

```text
account-signup: 5 / 15 min / IP
account-login: 10 / 10 min / IP
account-password-reset: 5 / 15 min / IP
account-profile: 20 / 10 min / IP
account-claim: 10 / 10 min / IP
```

- [ ] **Step 1: RED tests** require same-origin for mutating account routes, strict bounded JSON parsing, generic anti-enumeration reset responses, and no secrets in errors/logs.

- [ ] **Step 2: implement signup**

`POST /api/account/signup` accepts exactly `{name,email,whatsapp,password}`. Validate name 3..100, normalized email <=254, WhatsApp 10/11 digits, password 8..128. Call Supabase `auth.signUp` with `emailRedirectTo` pointing to `/auth/callback?next=/minha-conta`, storing only validated name/WhatsApp in user metadata. Return a generic success that tells the user to verify email; do not reveal whether an account already exists beyond the safe behavior Supabase supports.

- [ ] **Step 3: implement callback**

`GET /auth/callback?code=...&next=...` exchanges the PKCE code using the existing SSR server client. `next` is allowlisted to local account routes only; otherwise use `/minha-conta`. After a verified user is available, validate metadata and `ensureOwnCustomerProfile`; if metadata is absent/invalid, redirect to `/minha-conta/perfil?setup=1` rather than inventing profile data.

- [ ] **Step 4: implement login/logout**

Login accepts `{email,password}`, calls `signInWithPassword`, requires verified email before account access, returns generic invalid-credentials response. Logout is POST same-origin and local sign-out.

- [ ] **Step 5: implement password reset/update**

Reset accepts email and always returns the same user-facing success text. Recovery redirect goes through `/auth/callback?next=/minha-conta/seguranca?recovery=1`. Password update requires an authenticated recovery/current session and 8..128-character new password; never log password values.

- [ ] **Step 6: update proxy matcher** to refresh Supabase cookies for `/entrar`, `/criar-conta`, `/esqueci-a-senha`, `/auth/callback`, `/minha-conta/:path*`, and `/api/account/:path*`, while retaining all current admin matchers.

- [ ] **Step 7: GREEN/regression**

```bash
node --experimental-strip-types --test \
  tests/customer-account-actions.test.ts \
  tests/customer-auth.test.ts \
  tests/admin-auth.test.ts \
  tests/admin-auth-ui.test.ts
```

- [ ] **Step 8: commit** as `feat: add customer account auth flows`.

---

# Task 8 — RED/GREEN: customer-owned order repository

**Create:** `lib/server/customer-orders.ts`, `tests/customer-orders.test.ts`

**Interfaces:**

```ts
export async function listOwnOrders(input?: { page?: number; pageSize?: number }): Promise<{
  orders: CustomerOrderSummary[]
  total: number
  page: number
  pageSize: number
}>

export async function getOwnOrderById(orderId: string): Promise<CustomerOrderDetail | null>
```

Use the authenticated Supabase server client to call `customer_list_orders` and `customer_get_order`. The database derives owner from `auth.uid()`; TypeScript never passes a customer UUID into these read RPCs.

- [ ] **Step 1: RED tests** for page bounds, canonical UUID, strict JSON parsing, unknown payment status safe display data, no forbidden internal keys, and `null` for not-owned/missing detail.
- [ ] **Step 2: run RED**.
- [ ] **Step 3: implement strict parsers and RPC wrappers**.
- [ ] **Step 4: run GREEN**.
- [ ] **Step 5: commit** as `feat: add customer owned order reads`.

---

# Task 9 — RED/GREEN: secure guest-order claim

**Create:** `lib/server/customer-order-claim.ts`, `tests/customer-order-claim.test.ts`, `app/api/account/orders/claim/route.ts`, `components/account/order-claim-form.tsx`.

**Modify:** `app/pedido/[token]/page.tsx`.

**Interfaces:**

```ts
export type ClaimGuestOrderResult =
  | { outcome: "claimed" | "already_claimed"; orderId: string; orderNumber: string }
  | { outcome: "not_claimable" }

export async function claimGuestOrder(input: {
  publicToken: string
  customer: CustomerIdentity
}): Promise<ClaimGuestOrderResult>
```

- [ ] **Step 1: RED tests** prove token format validation, verified-customer requirement, service-role payload uses only trusted `customer.userId/customer.email`, response is generic on mismatch, no token/email enters logs/events, repeated claim is idempotent, and no email-only claim function exists.

- [ ] **Step 2: implement service-role wrapper** around `rpc/claim_guest_order_for_customer` with strict parser and timeout.

- [ ] **Step 3: implement POST route** with same-origin + `account-claim` rate limit + `requireCustomerPageAccess`; body accepts only `{publicToken}`.

- [ ] **Step 4: add safe public tracking CTA**

On `/pedido/[token]`, preserve all existing token-authorized display behavior. If an authenticated verified customer is present and the order is still guest-owned with an email snapshot, show `Adicionar à minha conta`; otherwise show a local `/entrar?next=/pedido/<token>` login CTA when appropriate. Historical orders with no email snapshot get no claim button and remain usable by token.

- [ ] **Step 5: GREEN/regression** including public order display tests.

- [ ] **Step 6: commit** as `feat: add secure guest order claiming`.

---

# Task 10 — RED/GREEN: customer account UI

**Create:** account shell/nav/auth forms and all planned customer pages; `tests/customer-account-ui.test.ts`.

**Visual rule:** use storefront identity, not admin shell styling.

- [ ] **Step 1: RED structural tests** require routes, server-side protection, no admin components/imports in customer shell, logout POST, accessible labels, no secret/internal fields, and safe WhatsApp order contact.

- [ ] **Step 2: implement public auth pages**

`/entrar`, `/criar-conta`, `/esqueci-a-senha` use account APIs. Login preserves a sanitized local `next` destination only. Signup copy states email verification is required. Password reset never reveals account existence.

- [ ] **Step 3: implement protected account shell**

`/minha-conta` and descendants call `requireCustomerPageAccess()` server-side. Navigation: `Visão geral`, `Pedidos`, `Perfil`, `Segurança`, `Sair`.

- [ ] **Step 4: implement overview/list/detail**

Overview shows profile + recent orders. `/minha-conta/pedidos` paginates own orders. Detail uses `getOwnOrderById` and shows immutable items, totals, payment/production statuses, address snapshot, shipping service, customer-safe timeline, and WhatsApp link with encoded text containing only the order number, e.g. `Olá, gostaria de falar sobre o pedido PB-...`.

Do not display raw `payment_id`, `preference_id`, raw event metadata, public token, checkout internals, or admin audit.

- [ ] **Step 5: implement profile/security pages**

Profile allows explicit save of validated name/WhatsApp through POST API. Security supports password update/recovery; email identity is displayed read-only in this phase (email-change workflow is not introduced).

- [ ] **Step 6: GREEN**

```bash
node --experimental-strip-types --test tests/customer-account-ui.test.ts tests/order-display.test.ts
```

- [ ] **Step 7: commit** as `feat: add customer account pages`.

---

# Task 11 — security/isolation matrix

**Create:** `tests/customer-account-security.test.ts`

- [ ] **Step 1: test customer A cannot retrieve customer B order** through list/detail RPC contract and repository dependency fixtures.
- [ ] **Step 2: test guessed canonical order UUID returns the same not-found behavior for missing vs other-owned order**.
- [ ] **Step 3: test guest token tracking remains independent from account ownership**.
- [ ] **Step 4: test claim rejects wrong verified email even with a valid token**.
- [ ] **Step 5: test claim rejects correct email without token and token without verified identity**.
- [ ] **Step 6: test authenticated customer session still fails admin authorization unless immutable admin UUID/AAL2/admin-session conditions are independently satisfied**.
- [ ] **Step 7: test customer DTOs contain none of:** `public_token`, `checkout_attempt_id`, `checkout_fingerprint`, `checkout_url`, `shipping_snapshot`, `admin_audit`, `payment_id`, `preference_id`.
- [ ] **Step 8: run security suite** and commit `test: verify customer account isolation`.

---

# Task 12 — full Phase 3 candidate review

No new feature work unless review finds a defect.

- [ ] **Step 1: run focused Phase 3 suite**

```bash
node --experimental-strip-types --test \
  tests/customer-account-migration.test.ts \
  tests/checkout-email.test.ts \
  tests/customer-auth.test.ts \
  tests/customer-profile.test.ts \
  tests/customer-orders.test.ts \
  tests/customer-order-claim.test.ts \
  tests/customer-account-actions.test.ts \
  tests/customer-account-ui.test.ts \
  tests/customer-account-security.test.ts
```

- [ ] **Step 2: run exact full gates**

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all PASS on the exact candidate commit.

- [ ] **Step 3: review diff against Phase 3 scope**

Reject accidental changes to Mercado Pago financial authority, static catalog authority, label purchase, admin auth requirements, hosting redesign, and Phase 6 transactional notifications.

- [ ] **Step 4: review security**

Confirm:

- browser never chooses customer UUID;
- customer read RPCs use `auth.uid()`;
- claim RPC service-role only and row-locking;
- no email-only claim;
- public token remains private from account DTOs;
- customer A/B isolation;
- admin boundary unchanged;
- passwords/tokens absent from logs/audit/events/docs.

- [ ] **Step 5: update Master Plan + CURRENT_STATUS** with exact SHA/CI evidence and stop at the DDL approval gate.

---

# Task 13 — owner-approved current Supabase application/validation

**Gate:** do not execute until the owner explicitly approves the exact reviewed `202609020003_customer_accounts_orders.sql` migration.

After approval:

- [ ] Apply the exact migration once to current `ProxyBembem` Supabase project.
- [ ] Verify migration history and schema objects/grants/RLS.
- [ ] Prove old orders remain `customer_email IS NULL AND customer_id IS NULL` unless they already truthfully had future fields; do not mutate them for testing.
- [ ] Use rollback-only synthetic fixtures to validate:
  1. customer A list sees A only;
  2. customer A detail cannot see B;
  3. guest new-order shape supports email + null owner;
  4. authenticated-order shape supports email + owner;
  5. correct email + token claim succeeds;
  6. replay returns already claimed without duplicate event;
  7. wrong email + valid token is not claimable;
  8. historical null-email order is not claimable;
  9. already-owned-by-other is not claimable;
  10. no customer RPC returns forbidden fields.
- [ ] Roll back fixtures and prove zero persistent test orders/profiles/events remain.
- [ ] Run Supabase security/performance advisors and classify findings.
- [ ] Record exact evidence.

---

# Task 14 — Preview acceptance

Use a READY Preview containing the exact Phase 3 runtime candidate or a docs-only descendant after Task 13 DB compatibility.

- [ ] Automated smoke: `/`, `/produtos`, checkout form visibly requires email, guest checkout validation rejects missing/invalid email without initiating payment, public invalid-token tracking remains safe.
- [ ] Protected customer surfaces without session redirect to `/entrar` and expose no orders.
- [ ] Owner creates/uses a test customer through normal Supabase Auth verification flow; credentials/TOTP/passwords are never shared in chat.
- [ ] Verify login, `/minha-conta`, own orders, own detail, profile, security page.
- [ ] Verify a second account cannot access first-account order by copied UUID.
- [ ] Verify guest claim using a deliberately created safe test order only; no real Mercado Pago payment required.
- [ ] Do not alter real order fulfillment/payment, buy labels, or merge/promote Production during Preview acceptance.
- [ ] Review Preview error/fatal logs after smoke.

---

# Task 15 — Phase 3 completion gate

Phase 3 is complete only when:

- every unit has valid RED -> GREEN evidence;
- full `pnpm test`, `pnpm typecheck`, `pnpm build` pass on the exact runtime candidate;
- security/isolation review passes;
- exact migration is owner-approved/applied/rollback-tested with zero fixtures;
- checkout email requirement works for guests;
- authenticated checkout links trusted UUID + canonical account email;
- customer account verification/login/reset/profile/owned-order flows pass Preview;
- verified-email + token claim works and email-only claim does not exist;
- old null-email orders remain unclaimed/public-token-only;
- admin/payment/catalog/shipping boundaries remain unchanged;
- Master Plan + CURRENT_STATUS record exact evidence;
- merge/new Production application deployment remains a **separate explicit owner decision**.

**Next phase after acceptance:** Phase 4 database catalog + admin products. Do not start Phase 4 runtime work before Phase 3 completion is recorded.
