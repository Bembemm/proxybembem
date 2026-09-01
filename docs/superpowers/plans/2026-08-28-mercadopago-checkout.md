# Mercado Pago Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add direct Mercado Pago Checkout Pro payments to ProxyBembem with server-authoritative pricing, Supabase order persistence, signed webhooks, and a customer order-status page.

**Architecture:** Keep the current Next.js storefront and cart UI, but move all payment authority to server Route Handlers. The checkout endpoint rebuilds items from `data/products.ts`, stores an order in Supabase, creates a Mercado Pago preference via HTTPS API, and redirects the customer; a signed webhook later fetches the payment and updates the order. No new runtime package is required because both provider APIs use `fetch` and webhook verification uses Node `crypto`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, Tailwind CSS 4, Mercado Pago REST APIs, Supabase PostgREST, Node `crypto`.

**Spec:** `docs/superpowers/specs/2026-08-28-mercadopago-checkout-design.md`

## Global Constraints

- Keep `main` untouched; implement on `feat/checkout-mercadopago`.
- Never trust browser-provided product prices, titles or payment statuses.
- Persist only product IDs and quantities in localStorage; re-resolve products from the catalog.
- Never expose Mercado Pago or Supabase secret credentials in client code.
- Freight is explicitly outside the first payment and remains calculated/combined in service.
- Payment is marked `approved` only after server-to-server verification and exact amount validation.
- No customer account/admin panel/freight API in this version.

---

### Task 1: Secure cart persistence and checkout validation

**Files:**
- Modify: `contexts/cart-context.tsx`
- Modify: `lib/checkout.ts`
- Modify: `components/checkout-form.tsx`

**Interfaces:**
- Produces `CheckoutData = { nome: string; whatsapp: string; cep: string }`.
- Produces persisted cart payload `{ productId: number; quantity: number }[]`.
- Runtime UI continues consuming `CartItem[]` with full catalog products.

- [ ] **Step 1: Define validation behavior before implementation**

Expected rules:

```text
nome: trimmed/collapsed, 3..100 characters
whatsapp: 10 or 11 Brazilian digits after removing punctuation
cep: exactly 8 digits and not all repeated
quantity: positive integer; persisted values are re-resolved against catalog IDs
```

- [ ] **Step 2: Modify cart hydration/persistence**

Write localStorage as only product IDs + quantities. Read both the new shape and the old full-product shape, but always look up the current product by ID from `data/products.ts` and discard any persisted price/title.

- [ ] **Step 3: Extend checkout validation/form**

Add WhatsApp formatting and error text while retaining name and CEP. Use `tel`/`inputMode` semantics and length limits.

- [ ] **Step 4: Run type check**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contexts/cart-context.tsx lib/checkout.ts components/checkout-form.tsx
git commit -m "fix: make cart prices server authoritative"
```

### Task 2: Add server order and provider clients

**Files:**
- Create: `lib/server/env.ts`
- Create: `lib/server/orders.ts`
- Create: `lib/server/mercadopago.ts`
- Create: `supabase/migrations/202608280001_create_orders.sql`
- Create: `.env.example`

**Interfaces:**
- `getServerEnv()` validates server secrets.
- `createOrder(input)` inserts a pending order and returns it.
- `updateOrderByNumber(orderNumber, patch)` updates provider/payment fields.
- `getOrderByPublicToken(token)` returns safe server-side order data.
- `createMercadoPagoPreference(input)` returns `{ id, initPoint, sandboxInitPoint? }`.
- `getMercadoPagoPayment(paymentId)` returns normalized provider payment details.
- `validateMercadoPagoWebhookSignature(input)` returns boolean.

- [ ] **Step 1: Add strict environment reader**

Required variables:

```text
MERCADO_PAGO_ACCESS_TOKEN
MERCADO_PAGO_WEBHOOK_SECRET
SUPABASE_URL
SUPABASE_SECRET_KEY
```

Optional:

```text
NEXT_PUBLIC_SITE_URL
```

Throw only on server when a required integration path is executed.

- [ ] **Step 2: Add Supabase REST client helpers**

Use server-side `fetch` with both `apikey` and `Authorization: Bearer <SUPABASE_SECRET_KEY>` headers, `Prefer: return=representation`, `cache: no-store`, and generic thrown errors. Do not expose returned customer fields to browser code by default.

- [ ] **Step 3: Add Mercado Pago REST helpers**

Create preferences with `POST https://api.mercadopago.com/checkout/preferences` and fetch payments with `GET https://api.mercadopago.com/v1/payments/{id}` using Bearer auth. Implement HMAC-SHA256 signature validation using manifest `id:<dataId>;request-id:<requestId>;ts:<ts>;` and `timingSafeEqual`.

- [ ] **Step 4: Add SQL migration**

Create the `orders` table, indexes, `updated_at` trigger, RLS, revoke browser-role privileges, and grant server role access.

- [ ] **Step 5: Add `.env.example`**

Document names only; never commit actual values.

- [ ] **Step 6: Run type check**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/server supabase/migrations .env.example
git commit -m "feat: add secure payment server clients"
```

### Task 3: Create checkout and webhook Route Handlers

**Files:**
- Create: `app/api/checkout/route.ts`
- Create: `app/api/mercadopago/webhook/route.ts`
- Create: `lib/server/checkout-order.ts`

**Interfaces:**
- `POST /api/checkout` consumes `{ items, customer }` and returns `{ checkoutUrl, orderNumber }`.
- `POST /api/mercadopago/webhook` accepts Mercado Pago payment notifications.
- `buildCheckoutOrder(request)` validates IDs/quantities, snapshots current catalog data and calculates integer cents.

- [ ] **Step 1: Implement request validation and catalog resolution**

Accept only arrays of `{ productId, quantity }`; require 1..50 line items and quantities 1..20. Resolve each ID from `data/products.ts`; reject unknown IDs and merge duplicate IDs before totals.

- [ ] **Step 2: Implement checkout endpoint**

Generate `PB-<12 hex chars>` with `crypto.randomBytes(6)` and a 32-byte public token. Insert order first, create Mercado Pago preference with current catalog prices, `currency_id: BRL`, `external_reference`, `notification_url`, `back_urls`, and `auto_return: approved`, then persist preference ID and return the appropriate redirect URL.

If provider preference creation fails after the order insert, leave the order pending with an error status/detail suitable for internal diagnosis but return a generic `503` to the browser.

- [ ] **Step 3: Implement webhook endpoint**

Require topic `payment`, validate the HMAC signature, fetch the payment by ID from Mercado Pago, derive `external_reference`, load the order, compare the exact amount, and update provider fields. For approved amount mismatch, store `manual_review` instead of `approved`. Respond `200` after successfully handling a legitimate event; `401` for bad signatures.

- [ ] **Step 4: Run type check**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api lib/server/checkout-order.ts
git commit -m "feat: create Mercado Pago checkout and webhook"
```

### Task 4: Connect cart UI and add order status page

**Files:**
- Modify: `components/cart-panel.tsx`
- Modify: `components/order-summary.tsx`
- Create: `app/pedido/[token]/page.tsx`
- Create: `components/order-status.tsx`

**Interfaces:**
- Cart calls `/api/checkout` using only `{ productId, quantity }` plus validated customer data.
- Order page loads by public token server-side and never trusts a `status` query parameter.

- [ ] **Step 1: Replace primary WhatsApp checkout action**

Submit the cart to `/api/checkout`, show loading/error states, and redirect with `window.location.assign(checkoutUrl)` only after a successful response. Retain a secondary WhatsApp fallback.

- [ ] **Step 2: Update order summary disclosure**

Primary copy must state that Mercado Pago handles Pix/card securely and that the amount covers products; freight is calculated separately in service.

- [ ] **Step 3: Add customer order page**

Render paid/pending/failed/reversed/manual-review states from the stored order. Show order number, safe item snapshot, subtotal, and a post-payment WhatsApp link that includes the order number and asks the customer to send the deck/list.

- [ ] **Step 4: Clear the local cart only after confirmed payment**

On the customer page, use a tiny client component to clear the cart when the server-rendered status is `approved`. Do not clear on redirect initiation.

- [ ] **Step 5: Run type check**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components app/pedido
git commit -m "feat: connect storefront to secure checkout"
```

### Task 5: Setup guide, CI verification and review

**Files:**
- Create: `docs/payments-setup.md`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Setup guide covers Supabase SQL, Mercado Pago test app credentials, webhook URL/secret, Vercel env vars, simulator, and production switch.
- CI runs dependency install from the existing lockfile, TypeScript checks and Next production build.

- [ ] **Step 1: Write operator setup guide**

Include exact environment variable names, SQL migration path, webhook endpoint `/api/mercadopago/webhook`, and warning that normal test payments do not emit standard payment webhooks according to Mercado Pago documentation; use the provider simulator for webhook reception tests.

- [ ] **Step 2: Add GitHub Actions workflow**

Use Node 24 + pnpm with frozen lockfile, then:

```bash
pnpm typecheck
pnpm build
```

- [ ] **Step 3: Run/observe verification**

Expected: typecheck and build pass. If GitHub Actions cannot run because repository Actions are disabled or secrets are intentionally absent at build time, ensure integration code reads secrets lazily so build still succeeds without production credentials.

- [ ] **Step 4: Compare branch to main**

Review changed files for committed secrets, client-side secret imports, browser-trusted price/status, and unrelated refactors.

- [ ] **Step 5: Open a pull request**

Title: `feat: add secure Mercado Pago checkout`

Body must state that production activation still requires the owner to create/configure Supabase and Mercado Pago credentials and to confirm Mercado Pago eligibility for the sold products.