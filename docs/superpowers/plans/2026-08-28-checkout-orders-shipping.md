# Checkout, Address, Shipping Total, and Order Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current product-only Mercado Pago checkout into a full-address checkout that revalidates the selected freight server-side, stores an immutable shipping snapshot, charges product subtotal plus freight, and resists duplicate/abusive checkout creation.

**Architecture:** The browser first obtains signed freight choices from `/api/shipping/quote`. Checkout submits trusted cart IDs/quantities, complete address, a signed selected quote token, and a client-generated checkout attempt UUID. The backend verifies/requotes freight, persists the order atomically enough to enforce idempotency, and creates a Mercado Pago preference from server-derived product and freight amounts only.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase/PostgREST/PostgreSQL migrations, Mercado Pago Checkout Pro, Melhor Envio quote service from Plan 1, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-28-shipping-checkout-security-design.md`

## Global Constraints

- Execute after `2026-08-28-shipping-foundation.md` is complete and green.
- All work stays on `feat/checkout-mercadopago`; do not merge `main`.
- Full delivery address is collected before payment.
- Required: CEP, street, number, neighborhood, city, UF. Complement is optional.
- Browser values never control product price, freight price, final total, product shipping metadata, or Mercado Pago amount.
- Checkout re-quotes the selected Melhor Envio service immediately before payment creation.
- If freight changes, return a conflict and require buyer confirmation; never silently charge a changed amount.
- Store product subtotal, freight, total, selected service/carrier, ETA, address, and provider quote/package snapshot.
- Existing historical/test orders must remain readable after migrations.
- Manual Melhor Envio label purchase remains outside API scope.
- Rate limiting uses existing Supabase/PostgreSQL infrastructure; no new paid vendor.
- Do not put customer address into URL query strings or analytics payloads.

---

## File Structure

- Create `supabase/migrations/202608280002_shipping_checkout_hardening.sql` — address/shipping/idempotency/rate-limit schema.
- Modify `lib/checkout.ts` — full address model, formatting, validation, WhatsApp fallback copy.
- Modify `components/checkout-form.tsx` — address fields.
- Create `components/shipping-options.tsx` — quote loading/selection UI.
- Modify `components/cart-panel.tsx` — quote lifecycle, selected token, idempotency UUID, changed-quote handling.
- Modify `components/order-summary.tsx` — product subtotal, selected freight, final total.
- Modify `lib/server/orders.ts` — extended order model, lookup by checkout attempt, stored checkout URL.
- Create `lib/server/request-body.ts` — bounded JSON request reader.
- Create `lib/server/rate-limit.ts` — HMAC IP key and Supabase RPC consumption.
- Create `lib/server/checkout-idempotency.ts` — attempt validation/fingerprint behavior.
- Modify `lib/server/mercadopago.ts` — include explicit freight item/amount.
- Modify `app/api/checkout/route.ts` — full server-authoritative flow.
- Modify/add tests: `tests/checkout.test.ts`, `tests/checkout-order.test.ts`, `tests/request-body.test.ts`, `tests/rate-limit.test.ts`, `tests/checkout-idempotency.test.ts`, `tests/mercadopago-preference.test.ts`.

### Task 1: Extend the database for shipping/address/idempotency

**Files:**
- Create: `supabase/migrations/202608280002_shipping_checkout_hardening.sql`

**Interfaces:**

New `orders` columns:

```sql
checkout_attempt_id uuid,
checkout_fingerprint text,
checkout_url text,
address_street text,
address_number text,
address_complement text,
address_neighborhood text,
address_city text,
address_state text,
shipping_provider text,
shipping_service_id text,
shipping_service_name text,
shipping_carrier_name text,
shipping_delivery_days integer,
shipping_cents integer,
total_cents integer,
shipping_snapshot jsonb
```

New rate-limit table/function:

```sql
public.api_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null
)

public.consume_api_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
```

- [ ] **Step 1: Write the migration with backwards-compatible defaults**

Use:

```sql
alter table public.orders
  add column if not exists checkout_attempt_id uuid,
  add column if not exists checkout_fingerprint text,
  add column if not exists checkout_url text,
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists address_neighborhood text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists shipping_provider text,
  add column if not exists shipping_service_id text,
  add column if not exists shipping_service_name text,
  add column if not exists shipping_carrier_name text,
  add column if not exists shipping_delivery_days integer,
  add column if not exists shipping_cents integer,
  add column if not exists total_cents integer,
  add column if not exists shipping_snapshot jsonb;
```

Keep new fields nullable so existing test rows remain valid.

Add checks for new rows/values without invalidating old nulls:

```sql
alter table public.orders
  add constraint orders_shipping_cents_nonnegative check (shipping_cents is null or shipping_cents >= 0),
  add constraint orders_total_cents_positive check (total_cents is null or total_cents > 0),
  add constraint orders_address_state_format check (address_state is null or address_state ~ '^[A-Z]{2}$');
```

Create unique indexes:

```sql
create unique index if not exists orders_checkout_attempt_id_uidx
  on public.orders (checkout_attempt_id)
  where checkout_attempt_id is not null;

create unique index if not exists orders_preference_id_uidx
  on public.orders (preference_id)
  where preference_id is not null;
```

Do not make `payment_id` unique in this migration; that is added together with the atomic payment transition in Plan 3 so existing data is checked first.

- [ ] **Step 2: Add the atomic rate-limit function**

The function must lock/update one bucket in one transaction. Semantics:

- first request creates a bucket with count 1 and returns true;
- expired window resets to count 1 and current `now()`;
- count below limit increments and returns true;
- count at/above limit returns false without incrementing.

Use `security definer`, `set search_path = ''`, schema-qualified table names, revoke from `public/anon/authenticated`, grant execute only to `service_role`.

- [ ] **Step 3: Verify SQL manually before applying**

Check that every `ALTER ... ADD CONSTRAINT` name is unique and that nullable historical rows satisfy all checks.

- [ ] **Step 4: Apply migration in the existing Supabase development project**

Use the project's normal migration mechanism. After application, verify one historical order is still queryable and new columns are nullable.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202608280002_shipping_checkout_hardening.sql
git commit -m "feat: extend orders for shipping checkout"
```

### Task 2: Expand checkout data/address validation

**Files:**
- Modify: `lib/checkout.ts`
- Test: `tests/checkout.test.ts`

**Interfaces:**

Use this data model:

```ts
export interface CheckoutData {
  nome: string
  whatsapp: string
  cep: string
  rua: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}
```

- [ ] **Step 1: Write failing validation tests**

Cover:

- CEP exactly 8 digits after normalization;
- street 2..120 trimmed characters;
- number 1..20 trimmed characters;
- complement optional, max 80;
- neighborhood 2..80;
- city 2..80;
- UF exactly two alphabetic characters, normalized uppercase;
- existing name/WhatsApp validation remains;
- excessive Unicode/whitespace is normalized without accepting an empty result.

Example:

```ts
assert.equal(validateCheckout({ ...valid, uf: "parana" }).uf, "Informe a UF com 2 letras.")
```

- [ ] **Step 2: Run and verify RED**

Run: `node --experimental-strip-types --test tests/checkout.test.ts`

Expected: FAIL because the new fields are not validated.

- [ ] **Step 3: Implement validation and normalization helpers**

Add:

```ts
export function normalizeCheckoutData(data: CheckoutData): CheckoutData
```

Normalize whitespace with `trim().replace(/\s+/g, " ")`, digit-only CEP/WhatsApp, and uppercase UF.

Update WhatsApp fallback message so it no longer says freight is "A calcular" once a selected shipping option is supplied by the caller.

- [ ] **Step 4: Run tests/typecheck**

Run: `pnpm test && pnpm typecheck`

Expected: PASS after callers are adjusted to compile.

- [ ] **Step 5: Commit**

```bash
git add lib/checkout.ts tests/checkout.test.ts
git commit -m "feat: validate complete delivery address"
```

### Task 3: Add a real bounded JSON body reader

**Files:**
- Create: `lib/server/request-body.ts`
- Test: `tests/request-body.test.ts`

**Interfaces:**

```ts
export class RequestBodyTooLargeError extends Error {}
export class InvalidJsonBodyError extends Error {}

export async function readJsonBody(request: Request, maxBytes = 32_768): Promise<unknown>
```

- [ ] **Step 1: Write failing tests**

Cover valid JSON, malformed JSON, body exactly at limit, body one byte above limit, omitted `Content-Length`, dishonest smaller `Content-Length`, and UTF-8 multibyte characters measured as bytes with `Buffer.byteLength`.

- [ ] **Step 2: Run and verify RED**

Run: `node --experimental-strip-types --test tests/request-body.test.ts`

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement bounded read**

Use `await request.text()`, check `Buffer.byteLength(text, "utf8")`, then `JSON.parse`. Keep the existing early `Content-Length` rejection as a fast path, but never rely on it alone.

- [ ] **Step 4: Run tests**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/request-body.ts tests/request-body.test.ts
git commit -m "fix: enforce checkout request size limits"
```

### Task 4: Add application-level rate limiting

**Files:**
- Create: `lib/server/rate-limit.ts`
- Modify: `lib/server/env.ts`
- Modify: `.env.example`
- Test: `tests/rate-limit.test.ts`

**Interfaces:**

```ts
export async function consumeRateLimit(input: {
  request: Request
  scope: "shipping-quote" | "checkout"
}): Promise<boolean>
```

Exact limits:

```ts
shipping-quote: 60 requests / 10 minutes / IP
checkout: 10 requests / 10 minutes / IP
```

- [ ] **Step 1: Write failing tests**

Test trusted IP extraction order from previous hosting provider headers, HMAC hashing, no raw IP in Supabase request body, scope isolation, and false when RPC returns `false`.

Use `RATE_LIMIT_SECRET` with minimum 32 characters.

- [ ] **Step 2: Run and verify RED**

Run: `node --experimental-strip-types --test tests/rate-limit.test.ts`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement rate limit client**

Derive bucket key:

```ts
HMAC_SHA256(RATE_LIMIT_SECRET, `${scope}:${clientIp}`)
```

Call Supabase RPC:

```text
POST /rest/v1/rpc/consume_api_rate_limit
```

with the hashed key, exact limit, and 600-second window. Use the same service-role server credential path already used by `orders.ts`. Never log client IP or the secret.

If no usable previous hosting provider forwarding IP exists, hash the literal `unknown` plus scope; do not trust arbitrary client body fields as IP.

- [ ] **Step 4: Add endpoint usage**

At the beginning of `/api/shipping/quote` call `consumeRateLimit(...scope: "shipping-quote")`; return `429` with `Retry-After: 600` when denied.

Checkout uses `scope: "checkout"` in Task 8.

- [ ] **Step 5: Run tests/typecheck and commit**

```bash
pnpm test && pnpm typecheck
git add lib/server/rate-limit.ts lib/server/env.ts .env.example app/api/shipping/quote/route.ts tests/rate-limit.test.ts
git commit -m "feat: rate limit shipping and checkout APIs"
```

### Task 5: Add checkout attempt idempotency helpers

**Files:**
- Create: `lib/server/checkout-idempotency.ts`
- Test: `tests/checkout-idempotency.test.ts`

**Interfaces:**

```ts
export function parseCheckoutAttemptId(value: unknown): string | null
export function createCheckoutFingerprint(input: {
  cartFingerprint: string
  customer: CheckoutData
  quoteClaims: ShippingQuoteClaims
}): string
```

- [ ] **Step 1: Write failing tests**

Accept lowercase/uppercase canonical UUID text and normalize to lowercase. Reject nil UUID, malformed, overlong strings, and non-strings.

Fingerprint must change if cart, normalized customer/address, service, destination CEP, or quoted price changes; it must not include public token/order number.

- [ ] **Step 2: Run RED**

Run: `node --experimental-strip-types --test tests/checkout-idempotency.test.ts`

- [ ] **Step 3: Implement with SHA-256 over deterministic JSON**

Serialize a fixed-key object; do not depend on arbitrary object key order.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test
git add lib/server/checkout-idempotency.ts tests/checkout-idempotency.test.ts
git commit -m "feat: add checkout idempotency fingerprints"
```

### Task 6: Extend order storage APIs

**Files:**
- Modify: `lib/server/orders.ts`
- Test: `tests/orders.test.ts`

**Interfaces:**

Extend `OrderRecord` with all migration fields.

Add:

```ts
export async function getOrderByCheckoutAttemptId(attemptId: string): Promise<OrderRecord | null>
```

Extend `createOrder` input with normalized address, shipping data, `checkoutAttemptId`, `checkoutFingerprint`, `shippingCents`, `totalCents`, and `shippingSnapshot`.

Extend allowed patches to include `checkout_url` plus existing payment fields.

- [ ] **Step 1: Write failing fetch-body tests**

Mock `fetch` and assert `createOrder` persists:

```ts
{
  checkout_attempt_id,
  checkout_fingerprint,
  address_street,
  address_number,
  address_complement,
  address_neighborhood,
  address_city,
  address_state,
  shipping_provider: "melhor_envio",
  shipping_service_id,
  shipping_service_name,
  shipping_carrier_name,
  shipping_delivery_days,
  shipping_cents,
  total_cents,
  shipping_snapshot
}
```

- [ ] **Step 2: Run RED**

Run: `node --experimental-strip-types --test tests/orders.test.ts`

- [ ] **Step 3: Implement/select new columns**

Keep PostgREST access server-only and `Cache-Control` behavior unchanged.

- [ ] **Step 4: Run tests/typecheck and commit**

```bash
pnpm test && pnpm typecheck
git add lib/server/orders.ts tests/orders.test.ts
git commit -m "feat: persist checkout shipping details"
```

### Task 7: Make Mercado Pago preference include freight

**Files:**
- Modify: `lib/server/mercadopago.ts`
- Create: `tests/mercadopago-preference.test.ts`

**Interfaces:**

Extend preference input:

```ts
shipping: {
  serviceName: string
  carrierName: string
  amountCents: number
}
```

- [ ] **Step 1: Write failing payload test**

For product subtotal 11990 and freight 1842, assert Mercado Pago request items sum to 13832 and contains one explicit freight line:

```ts
{
  id: "shipping",
  title: "Frete - Correios / PAC",
  quantity: 1,
  currency_id: "BRL",
  unit_price: 18.42,
}
```

- [ ] **Step 2: Run RED**

Run: `node --experimental-strip-types --test tests/mercadopago-preference.test.ts`

- [ ] **Step 3: Implement trusted freight item**

Reject non-safe-integer/non-positive `amountCents`. Preserve the current `external_reference`, notification URL, payer name, return URLs, and Checkout Pro behavior.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test && pnpm typecheck
git add lib/server/mercadopago.ts tests/mercadopago-preference.test.ts
git commit -m "feat: charge freight in Mercado Pago preference"
```

### Task 8: Rewrite checkout creation around signed freight, requote, idempotency, and rate limit

**Files:**
- Modify: `app/api/checkout/route.ts`
- Modify: `lib/server/shipping-quote.ts`
- Test: `tests/checkout-route.test.ts`

**Interfaces:**

Request shape:

```ts
{
  items: Array<{ productId: number; quantity: number }>,
  customer: CheckoutData,
  selectedQuoteToken: string,
  checkoutAttemptId: string
}
```

Success:

```ts
{ checkoutUrl: string; orderNumber: string }
```

Changed quote response (`409`):

```ts
{
  error: "O valor do frete foi atualizado. Confirme o novo valor para continuar.",
  code: "shipping_changed",
  options: PublicShippingOption[]
}
```

- [ ] **Step 1: Write failing route-helper tests**

Extract core orchestration into a testable server function rather than mocking `NextRequest` deeply. Cover:

- invalid/missing quote token -> 400 behavior;
- quote token cart fingerprint mismatch -> 400;
- token destination CEP mismatch -> 400;
- requote selected service missing -> 409 with refreshed options;
- requote price changed -> 409 with refreshed options;
- unchanged quote -> `totalCents = subtotalCents + shippingCents`;
- client fake prices ignored;
- duplicate same `checkoutAttemptId` + same fingerprint + existing `checkout_url` returns the same URL/order;
- duplicate same attempt ID + different fingerprint -> 409;
- rate-limit denial -> 429 before Melhor Envio/Mercado Pago calls;
- oversized body -> 413;
- preference failure marks only that reserved order `checkout_error`.

- [ ] **Step 2: Run RED**

Run: `node --experimental-strip-types --test tests/checkout-route.test.ts`

- [ ] **Step 3: Implement exact sequence**

Order of operations:

1. rate limit;
2. bounded JSON parse;
3. parse/normalize customer and attempt UUID;
4. rebuild trusted cart;
5. verify signed quote token;
6. compare token cart fingerprint and destination CEP;
7. re-query Melhor Envio for current options;
8. find the same service ID;
9. if missing/changed amount, return fresh `409` options and create no order/payment;
10. derive checkout fingerprint;
11. look up `checkoutAttemptId`; return prior URL only when fingerprint matches and URL exists;
12. reserve/create order with subtotal, shipping, total, address and quote/package snapshot;
13. create Mercado Pago preference using trusted items + shipping;
14. validate/select checkout URL;
15. persist `preference_id`, `checkout_url`, pending status;
16. return 201.

When a concurrent duplicate insert hits the unique attempt index, catch the storage conflict, load by attempt ID, compare fingerprint, and follow the same duplicate rules instead of generating a second preference.

- [ ] **Step 4: Verify all backend tests**

Run: `pnpm test && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/checkout/route.ts lib/server/shipping-quote.ts tests/checkout-route.test.ts
git commit -m "feat: revalidate freight during checkout"
```

### Task 9: Build full address and freight-selection UI

**Files:**
- Modify: `components/checkout-form.tsx`
- Create: `components/shipping-options.tsx`
- Modify: `components/cart-panel.tsx`
- Modify: `components/order-summary.tsx`
- Test: `tests/checkout-ui-state.test.ts`

**Interfaces:**

Client state includes:

```ts
selectedShipping: PublicShippingOption | null
shippingOptions: PublicShippingOption[]
isQuoting: boolean
shippingError: string | null
checkoutAttemptId: string | null
```

- [ ] **Step 1: Extract/test pure client state helpers**

Create pure functions in `lib/shipping-client.ts` and test:

- new cart/CEP invalidates selected freight and checkout attempt ID;
- selecting an option keeps its quote token;
- `shipping_changed` replaces options, clears selection, and does not redirect;
- final displayed total is product subtotal cents + selected freight cents.

- [ ] **Step 2: Run RED**

Run: `node --experimental-strip-types --test tests/checkout-ui-state.test.ts`

- [ ] **Step 3: Implement form fields and quote UI**

Use correct `autoComplete` values:

```text
street-address
address-line2
address-level2
address-level1
postal-code
```

Keep manual entry always available. Do not make CEP-autofill a blocker in this plan.

Trigger quote only when cart is non-empty and CEP has 8 normalized digits. Debounce 400ms after CEP/cart change to avoid provider spam. Display each option with carrier, service, formatted price, and estimated days.

- [ ] **Step 4: Implement checkout attempt behavior**

Create `crypto.randomUUID()` on first valid payment attempt. Reuse it for network retry with unchanged cart/customer/selected quote. Reset it whenever cart, address, or selected quote changes.

Browser validates checkout redirect with the shared Mercado Pago host validator from Plan 3 once available; until then preserve HTTPS check and do not weaken it.

- [ ] **Step 5: Update summary/copy**

Show:

```text
Produtos      R$ 119,90
Frete         R$ 18,42
Total         R$ 138,32
```

Disable payment while quote is loading or no shipping option is selected.

- [ ] **Step 6: Run verification and commit**

```bash
pnpm test && pnpm typecheck && pnpm build
git add components/checkout-form.tsx components/shipping-options.tsx components/cart-panel.tsx components/order-summary.tsx lib/shipping-client.ts tests/checkout-ui-state.test.ts
git commit -m "feat: add address and freight selection checkout UI"
```

## Plan 2 Completion Gate

Before Plan 3:

- backend recomputes all product/freight/total values;
- changing a browser price or quote token cannot reduce payment;
- changed freight returns 409 and requires explicit reselection;
- duplicate same checkout attempt reuses the previous result rather than creating a second preference;
- rate limits return 429 without provider work;
- new order row contains full address, shipping snapshot, subtotal, freight and total;
- Mercado Pago preference sum equals stored `total_cents`;
- `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
