# Melhor Envio Shipping Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-authoritative Melhor Envio quotation layer that supports multiple products/quantities, signs quote choices, and exposes only safe freight options to the browser.

**Architecture:** Product shipping metadata lives in the trusted catalog. The server rebuilds cart lines from IDs/quantities, calls Melhor Envio's product quotation endpoint, normalizes `custom_price`/`custom_delivery_time`, and signs each returned option with an HMAC quote token. The first store-only version uses a server-side bearer token configured in Vercel; it does not buy labels and does not expose provider credentials to the browser.

**Tech Stack:** Next.js 16 App Router, TypeScript, Node `node:test`, Node `crypto`, Melhor Envio API v2, Vercel environment variables.

**Spec:** `docs/superpowers/specs/2026-08-28-shipping-checkout-security-design.md`

## Global Constraints

- All work stays on `feat/checkout-mercadopago`; do not merge `main`.
- Melhor Envio is quote-only; label purchase remains manual.
- Origin CEP is `86730000`, read server-side from `SHIPPING_ORIGIN_CEP`.
- Current deck provisional shipping metadata is weight `0.25 kg`, length `25 cm`, width `19 cm`, height `4 cm`.
- The buyer pays exactly Melhor Envio `custom_price`; no packaging/handling surcharge is added to freight.
- The browser never controls product price, dimensions, weight, freight price, or final total.
- Use Melhor Envio `custom_price` and `custom_delivery_time`, not raw `price`/`delivery_time`.
- Send required `User-Agent` on Melhor Envio API calls.
- No provider secret/token may be logged, returned, committed, or added to client-side code.
- No automatic label/cart/checkout calls to Melhor Envio are in scope.

---

## File Structure

- Modify `contexts/cart-context.tsx` — add non-secret product shipping metadata type.
- Modify `data/products.ts` — attach provisional shipping metadata to the current product.
- Modify `lib/server/checkout-order.ts` — rebuild trusted shipping payload with product price/title.
- Modify `lib/server/env.ts` — parse Melhor Envio/shipping server configuration.
- Create `lib/server/melhor-envio.ts` — provider client and response normalization.
- Create `lib/server/shipping-quote-token.ts` — HMAC-signed quote token creation/verification.
- Create `app/api/shipping/quote/route.ts` — browser-safe quote endpoint.
- Create `tests/melhor-envio.test.ts` — provider payload/normalization tests.
- Create `tests/shipping-quote-token.test.ts` — token integrity/expiry tests.
- Create `tests/shipping-quote-route.test.ts` only if route logic cannot remain thin; otherwise test the extracted route helper in `lib/server/shipping-quote.ts`.
- Modify `.env.example` — variable names/placeholders only.

### Task 1: Add trusted per-product shipping metadata

**Files:**
- Modify: `contexts/cart-context.tsx`
- Modify: `data/products.ts`
- Modify: `lib/server/checkout-order.ts`
- Test: `tests/checkout-order.test.ts`

**Interfaces:**
- Produces `ProductShipping` with `weightKg`, `lengthCm`, `widthCm`, `heightCm`.
- Produces `CheckoutOrderItem.shipping` for later Melhor Envio payload construction.

- [ ] **Step 1: Write a failing catalog reconstruction test**

Add an assertion to `tests/checkout-order.test.ts` that the trusted rebuilt item contains the current product's shipping metadata and ignores fake browser metadata:

```ts
test("rebuilds shipping metadata from the server catalog", () => {
  const result = buildCheckoutOrder([
    {
      productId: 1,
      quantity: 2,
      shipping: { weightKg: 0.001, lengthCm: 1, widthCm: 1, heightCm: 1 },
    } as never,
  ])

  assert.deepEqual(result.items[0].shipping, {
    weightKg: 0.25,
    lengthCm: 25,
    widthCm: 19,
    heightCm: 4,
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm test`

Expected: the new assertion fails because `CheckoutOrderItem` has no `shipping` field.

- [ ] **Step 3: Add the shipping type and current product values**

In `contexts/cart-context.tsx` define:

```ts
export interface ProductShipping {
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
}
```

Add `shipping: ProductShipping` to `Product`.

In `data/products.ts`, add to product `id: 1`:

```ts
shipping: {
  weightKg: 0.25,
  lengthCm: 25,
  widthCm: 19,
  heightCm: 4,
},
```

In `lib/server/checkout-order.ts`, extend `CheckoutOrderItem` and the rebuilt item:

```ts
shipping: {
  weightKg: product.shipping.weightKg,
  lengthCm: product.shipping.lengthCm,
  widthCm: product.shipping.widthCm,
  heightCm: product.shipping.heightCm,
},
```

Validate every shipping number with `Number.isFinite`, require weight `> 0`, and dimensions to be positive integers or positive finite values accepted by the provider. Reject invalid catalog metadata before provider calls.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contexts/cart-context.tsx data/products.ts lib/server/checkout-order.ts tests/checkout-order.test.ts
git commit -m "feat: add product shipping metadata"
```

### Task 2: Add Melhor Envio server environment configuration

**Files:**
- Modify: `lib/server/env.ts`
- Modify: `.env.example`
- Create: `tests/melhor-envio-env.test.ts`

**Interfaces:**
- Produces `getMelhorEnvioEnv(): MelhorEnvioEnv`.

Use this exact shape:

```ts
export type MelhorEnvioEnvironment = "sandbox" | "production"

export interface MelhorEnvioEnv {
  environment: MelhorEnvioEnvironment
  accessToken: string
  userAgent: string
  originCep: string
  quoteSecret: string
}
```

Environment variable names:

```text
MELHOR_ENVIO_ENVIRONMENT
MELHOR_ENVIO_ACCESS_TOKEN
MELHOR_ENVIO_USER_AGENT
SHIPPING_ORIGIN_CEP
SHIPPING_QUOTE_SECRET
```

- [ ] **Step 1: Write failing tests for configuration validation**

Test that `SHIPPING_ORIGIN_CEP` must normalize to exactly 8 digits, environment accepts only `sandbox|production`, user agent is non-empty, and `SHIPPING_QUOTE_SECRET` has at least 32 characters.

Example:

```ts
assert.throws(() => getMelhorEnvioEnv(), /SHIPPING_ORIGIN_CEP/)
```

Restore `process.env` after each test so test order does not leak state.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --experimental-strip-types --test tests/melhor-envio-env.test.ts`

Expected: FAIL because `getMelhorEnvioEnv` does not exist.

- [ ] **Step 3: Implement `getMelhorEnvioEnv`**

Base URLs are selected in provider code from `environment`; never accept a URL from client input.

Normalize the origin CEP with `replace(/\D/g, "")` and reject anything not matching `/^\d{8}$/`.

`.env.example` must contain placeholders only:

```text
MELHOR_ENVIO_ENVIRONMENT=sandbox
MELHOR_ENVIO_ACCESS_TOKEN=
MELHOR_ENVIO_USER_AGENT=ProxyBembem (contato@proxybembem.com.br)
SHIPPING_ORIGIN_CEP=86730000
SHIPPING_QUOTE_SECRET=
```

- [ ] **Step 4: Run tests/typecheck**

Run: `pnpm test && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/env.ts .env.example tests/melhor-envio-env.test.ts
git commit -m "feat: configure Melhor Envio server environment"
```

### Task 3: Build the Melhor Envio quotation client

**Files:**
- Create: `lib/server/melhor-envio.ts`
- Test: `tests/melhor-envio.test.ts`

**Interfaces:**

```ts
export interface ShippingProductInput {
  id: string
  widthCm: number
  heightCm: number
  lengthCm: number
  weightKg: number
  insuranceValue: number
  quantity: number
}

export interface ShippingQuoteOption {
  serviceId: string
  serviceName: string
  carrierName: string
  priceCents: number
  deliveryDays: number
  packages: unknown[]
}

export async function quoteMelhorEnvio(input: {
  destinationCep: string
  products: ShippingProductInput[]
}): Promise<ShippingQuoteOption[]>
```

- [ ] **Step 1: Write failing provider-client tests**

Use `mock.method(globalThis, "fetch", async (...) => new Response(...))` to assert:

- sandbox calls `https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate`;
- production calls `https://melhorenvio.com.br/api/v2/me/shipment/calculate`;
- request contains `Authorization: Bearer ...`, `Accept`, `Content-Type`, and configured `User-Agent`;
- payload contains only trusted origin/destination CEPs and product fields;
- response uses `custom_price` and `custom_delivery_time`;
- entries with `error`, missing identifiers, invalid/non-positive price, or invalid delivery time are filtered out;
- provider 401/422/429/5xx throws a typed provider error without including token or raw sensitive headers.

Use a fixture such as:

```ts
[
  {
    id: 1,
    name: "PAC",
    custom_price: "18.42",
    custom_delivery_time: 6,
    company: { name: "Correios" },
    packages: [{ price: "18.42" }]
  }
]
```

Expected normalized result:

```ts
{
  serviceId: "1",
  serviceName: "PAC",
  carrierName: "Correios",
  priceCents: 1842,
  deliveryDays: 6,
  packages: [{ price: "18.42" }],
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --experimental-strip-types --test tests/melhor-envio.test.ts`

Expected: FAIL because the client does not exist.

- [ ] **Step 3: Implement provider client**

Construct the body exactly in product mode:

```ts
{
  from: { postal_code: env.originCep },
  to: { postal_code: destinationCep },
  products: input.products.map((product) => ({
    id: product.id,
    width: product.widthCm,
    height: product.heightCm,
    length: product.lengthCm,
    weight: product.weightKg,
    insurance_value: product.insuranceValue,
    quantity: product.quantity,
  })),
  options: { receipt: false, own_hand: false },
}
```

Do not send an explicit services allowlist so newly enabled services can appear without code changes.

Use `AbortSignal.timeout(10_000)` and `cache: "no-store"`.

Convert `custom_price` to cents with a decimal parser that rejects NaN/non-positive values; do not rely on floating-point string multiplication without validation.

- [ ] **Step 4: Run tests/typecheck**

Run: `pnpm test && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/melhor-envio.ts tests/melhor-envio.test.ts
git commit -m "feat: add Melhor Envio quote client"
```

### Task 4: Add signed quote tokens

**Files:**
- Create: `lib/server/shipping-quote-token.ts`
- Test: `tests/shipping-quote-token.test.ts`

**Interfaces:**

```ts
export interface ShippingQuoteClaims {
  serviceId: string
  priceCents: number
  destinationCep: string
  cartFingerprint: string
  expiresAt: number
}

export function createShippingQuoteToken(
  claims: Omit<ShippingQuoteClaims, "expiresAt">,
  secret: string,
  nowMs?: number,
): string

export function verifyShippingQuoteToken(
  token: string,
  secret: string,
  nowMs?: number,
): ShippingQuoteClaims | null

export function createCartFingerprint(items: Array<{ productId: number; quantity: number }>): string
```

- [ ] **Step 1: Write failing integrity/expiry tests**

Cover valid round-trip, one-byte signature tampering, payload tampering, malformed base64url, wrong secret, expired token, and fingerprint stability for the same normalized cart.

Quote lifetime is exactly 10 minutes:

```ts
const QUOTE_TTL_MS = 10 * 60 * 1000
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --experimental-strip-types --test tests/shipping-quote-token.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement HMAC token**

Use `HMAC-SHA256` and `timingSafeEqual`. Format:

```text
base64url(JSON claims).base64url(HMAC)
```

Reject tokens longer than 2048 characters before decoding.

`createCartFingerprint` must sort by `productId`, serialize only `{productId,quantity}`, and hash with SHA-256. It must not include client prices/titles/dimensions.

- [ ] **Step 4: Run tests**

Run: `pnpm test && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/shipping-quote-token.ts tests/shipping-quote-token.test.ts
git commit -m "feat: sign shipping quote selections"
```

### Task 5: Add the browser-safe shipping quote service and endpoint

**Files:**
- Create: `lib/server/shipping-quote.ts`
- Create: `app/api/shipping/quote/route.ts`
- Create: `tests/shipping-quote.test.ts`

**Interfaces:**

```ts
export interface PublicShippingOption {
  serviceId: string
  serviceName: string
  carrierName: string
  priceCents: number
  deliveryDays: number
  quoteToken: string
}

export async function buildShippingQuote(input: {
  items: unknown
  destinationCep: string
}): Promise<PublicShippingOption[]>
```

- [ ] **Step 1: Write failing service tests**

Test that `buildShippingQuote`:

- rejects non-8-digit CEPs;
- rebuilds cart through `buildCheckoutOrder`;
- maps each trusted item to Melhor Envio product input with `insuranceValue = unitPriceCents / 100`;
- keeps quantity as the normalized cart quantity;
- never consumes browser-provided price/dimension values;
- sorts returned options by `priceCents`, then `deliveryDays`;
- adds a valid quote token bound to destination CEP, selected service price and cart fingerprint;
- throws a controlled `ShippingUnavailableError` for no valid options/provider failure.

- [ ] **Step 2: Run and verify RED**

Run: `node --experimental-strip-types --test tests/shipping-quote.test.ts`

Expected: FAIL because `buildShippingQuote` does not exist.

- [ ] **Step 3: Implement the service and thin route**

Route request shape:

```ts
{
  items: Array<{ productId: number; quantity: number }>,
  destinationCep: string
}
```

Route success response:

```ts
{ options: PublicShippingOption[] }
```

Errors:

- `400` invalid cart/CEP;
- `503` provider unavailable/no option;
- `413` oversized request once shared body-limit helper is introduced in the checkout-hardening plan; until then enforce both `Content-Length <= 32768` and a `request.text()` byte-length check locally.

Do not return `packages`, provider raw response, token, authorization headers, or server catalog shipping metadata.

Return `Cache-Control: no-store`.

- [ ] **Step 4: Verify tests/typecheck/build**

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/shipping-quote.ts app/api/shipping/quote/route.ts tests/shipping-quote.test.ts
git commit -m "feat: expose secure shipping quotations"
```

## Plan 1 Completion Gate

Before moving to the checkout/order plan:

- `pnpm test` passes;
- `pnpm typecheck` passes;
- `pnpm build` passes;
- no secret value exists in git diff;
- quote endpoint works against Melhor Envio Sandbox with the server-side test token;
- the response contains only normalized public options and signed quote tokens;
- no Mercado Pago checkout behavior has changed yet.
