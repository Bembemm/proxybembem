# Authenticated Checkout and Private Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a verified customer account only when payment starts, bind every checkout-created order to that account, return Mercado Pago to the private account order page, and remove the public/guest order flow before launch.

**Architecture:** The public catalog, cart, and freight quote stay unchanged. `POST /api/checkout` becomes the authoritative authentication boundary and passes a required `CustomerIdentity` into the checkout core. Checkout attempt reuse is ownership-aware. Orders still receive the legacy `public_token` internally while the existing schema requires it, but application navigation no longer exposes or depends on it. Mercado Pago back URLs use the reserved order UUID under `/minha-conta/pedidos/[id]`. The old `/pedido/[token]` page and guest claim surfaces are deleted. All account order detail access continues through the existing owner-filtered customer repository.

**Tech Stack:** Next.js 16.3.3, React 19, TypeScript 5.7.3, Supabase Auth/Postgres, Mercado Pago Checkout Pro, Node.js 22.1.0, pnpm 10, KingHost standalone deployment.

**Spec:** `docs/superpowers/specs/2026-09-06-authenticated-checkout-private-orders-design.md`

## Global Constraints

- Do not change Mercado Pago webhook signature validation, payment-state rules, fulfillment transitions, Melhor Envio behavior, or admin authorization.
- Do not perform destructive database cleanup in this implementation. `orders.public_token` and the old claim RPC may remain in Postgres until the pre-launch clean-slate migration.
- No new guest checkout fallback.
- No client-supplied customer ID or email may choose order ownership.
- Preserve checkout idempotency and freight revalidation.
- Preserve cart contents across login using the existing `proxybembem-cart-v1` localStorage persistence; do not put cart contents into URLs, cookies, or auth metadata.
- Keep checkout/auth/private responses non-cacheable.
- Use TDD for every behavior change: write/modify the focused test, observe RED, implement the minimum change, observe GREEN, then run the adjacent regression set.
- Do not mark Task 14 complete until KingHost production acceptance verifies private ownership with two accounts.

---

## Task 1: Make `/api/checkout` reject anonymous or unverified customers

**Files:**
- Modify: `tests/checkout-route.test.ts`
- Modify: `app/api/checkout/route.ts`

- [ ] **Step 1: Change the route contract test to require an explicit authentication gate.**

Replace the current “optional identity” source assertion with assertions that the route obtains `getOptionalCustomerIdentity()`, returns a stable `401` response when it is absent, and only calls `executeCheckoutFlow` with a non-null identity.

The expected response contract is:

```ts
return jsonResponse(
  {
    error: "Entre na sua conta para continuar o pagamento.",
    code: "authentication_required",
  },
  401,
)
```

The test must also assert `Cache-Control: no-store` remains part of `jsonResponse` and that no browser-provided `customerId`/`customer_id` is accepted.

- [ ] **Step 2: Run the focused test and confirm RED.**

Run:

```bash
node --experimental-strip-types --test tests/checkout-route.test.ts
```

Expected: failure because the current route still passes nullable `customerIdentity` into the checkout flow.

- [ ] **Step 3: Implement the server authentication boundary.**

In `app/api/checkout/route.ts`, after rate-limit/origin validation and before `executeCheckoutFlow`, resolve:

```ts
const customerIdentity = await getOptionalCustomerIdentity()
if (!customerIdentity) {
  return jsonResponse(
    {
      error: "Entre na sua conta para continuar o pagamento.",
      code: "authentication_required",
    },
    401,
  )
}
```

Keep the existing request-body validation, same-origin enforcement, freight checks, provider URL allowlist, and error mapping.

- [ ] **Step 4: Run the focused test and confirm GREEN.**

```bash
node --experimental-strip-types --test tests/checkout-route.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit the boundary change.**

```bash
git add tests/checkout-route.test.ts app/api/checkout/route.ts
git commit -m "feat: require account for checkout"
```

---

## Task 2: Bind checkout attempts and new orders to the authenticated customer

**Files:**
- Modify: `tests/checkout-flow.test.ts`
- Modify: `tests/mixed-checkout-flow.test.ts`
- Modify: `tests/orders.test.ts`
- Modify: `lib/server/checkout-flow.ts`
- Modify: `lib/server/orders.ts`

- [ ] **Step 1: Update checkout-flow tests to define a verified identity and remove the guest-success expectation.**

Use a canonical test identity such as:

```ts
const CUSTOMER_IDENTITY = {
  userId: "550e8400-e29b-41d4-a716-446655440123",
  email: "cliente@example.com",
  emailVerified: true as const,
}
```

Add/adjust tests so they require all of the following:

1. `executeCheckoutFlow` rejects a missing/invalid runtime identity before reserving an order.
2. Checkout email differing from `CUSTOMER_IDENTITY.email` raises `CheckoutFlowValidationError("Authenticated email mismatch")` and creates nothing.
3. A new reservation always receives `customerId: CUSTOMER_IDENTITY.userId` and `customerEmail: CUSTOMER_IDENTITY.email`.
4. An existing attempt whose `customerId` differs from the current identity returns `attempt_conflict`, even if the checkout fingerprint matches.
5. An existing attempt with `customerId: null` also cannot be reused by an authenticated checkout.
6. An existing attempt owned by the same customer preserves the current idempotent reuse behavior.
7. The Mercado Pago `returnUrl` is exactly `https://preview.example.com/minha-conta/pedidos/<order-uuid>`.

Update fake attempt records from the old shape to:

```ts
{
  id: "550e8400-e29b-41d4-a716-446655440777",
  orderNumber: "PB-A1B2C3D4E5F6",
  customerId: CUSTOMER_IDENTITY.userId,
  checkoutFingerprint: fingerprint,
  checkoutUrl: null,
}
```

`publicToken` must no longer be part of `AttemptOrderView`.

- [ ] **Step 2: Update the mixed-cart test to pass the required identity and owned attempt shape.**

`tests/mixed-checkout-flow.test.ts` must pass `customerIdentity: CUSTOMER_IDENTITY` and its `reserveOrder` fake must return `id` plus `customerId`.

- [ ] **Step 3: Update the order-storage test so the normal checkout fixture is owned.**

In `tests/orders.test.ts`, change the principal checkout fixture from `customerId: null` to a valid UUID and rename the guest-specific test description. Keep `publicToken` in the storage payload only because the current database still requires it.

- [ ] **Step 4: Run the focused tests and confirm RED.**

```bash
node --experimental-strip-types --test tests/checkout-flow.test.ts tests/mixed-checkout-flow.test.ts tests/orders.test.ts
```

Expected: failures because `CheckoutFlowInput.customerIdentity` is currently optional, attempt views do not carry owner/id, and the return URL still uses `/pedido/<token>`.

- [ ] **Step 5: Make `CustomerIdentity` required in the checkout core.**

Change:

```ts
export interface CheckoutFlowInput {
  // ...
  customerIdentity: CustomerIdentity
}
```

In `validateInput`, fail closed if the runtime identity is malformed/missing, then keep the existing email equality check:

```ts
if (!input.customerIdentity?.userId || input.customerIdentity.emailVerified !== true) {
  throw new CheckoutFlowValidationError("Authenticated customer required")
}
if (customer.email !== input.customerIdentity.email) {
  throw new CheckoutFlowValidationError("Authenticated email mismatch")
}
```

The route already supplies only a verified identity produced by `getOptionalCustomerIdentity`; this runtime guard protects direct/internal misuse too.

- [ ] **Step 6: Make attempt reuse ownership-aware and carry the reserved order UUID.**

Change `AttemptOrderView` to:

```ts
interface AttemptOrderView {
  id: string
  orderNumber: string
  customerId: string | null
  checkoutFingerprint: string | null
  checkoutUrl: string | null
}
```

Update `toAttemptOrder` to map `id` and `customer_id` from `OrderRecord`.

Change `existingAttemptResult` to receive the current `customerId` and return `{ kind: "attempt_conflict" }` before fingerprint/url reuse whenever:

```ts
existing.customerId !== customerId
```

Use that same ownership check in the normal lookup, unique-conflict recovery, and concurrent preference wait paths.

- [ ] **Step 7: Persist ownership from the trusted identity only.**

Reservation input must use:

```ts
customerEmail: customerIdentity.email,
customerId: customerIdentity.userId,
```

Do not use `customer.email` as ownership authority and do not allow `null` in checkout-created reservations.

- [ ] **Step 8: Change Mercado Pago return navigation to the private UUID route.**

Keep generating the internal legacy token for the current DB insert, but replace:

```ts
const returnUrl = `${input.siteUrl}/pedido/${reserved.publicToken}`
```

with:

```ts
const returnUrl = `${input.siteUrl}/minha-conta/pedidos/${reserved.id}`
```

- [ ] **Step 9: Give account-email mismatch a specific route error.**

In `app/api/checkout/route.ts`, before the generic `CheckoutFlowValidationError` mapping, detect the exact mismatch error and return:

```ts
return jsonResponse(
  {
    error: "Use o mesmo e-mail da sua conta para continuar.",
    code: "account_email_mismatch",
    fieldErrors: {
      email: "Use o mesmo e-mail da sua conta.",
    },
  },
  400,
)
```

No order/preference may have been created in this case.

- [ ] **Step 10: Run the focused tests and confirm GREEN.**

```bash
node --experimental-strip-types --test tests/checkout-route.test.ts tests/checkout-flow.test.ts tests/mixed-checkout-flow.test.ts tests/orders.test.ts tests/checkout-email.test.ts tests/checkout-idempotency.test.ts
```

Expected: all pass.

- [ ] **Step 11: Commit the ownership/private-return change.**

```bash
git add tests/checkout-route.test.ts tests/checkout-flow.test.ts tests/mixed-checkout-flow.test.ts tests/orders.test.ts lib/server/checkout-flow.ts lib/server/orders.ts app/api/checkout/route.ts
git commit -m "feat: bind checkout orders to customer accounts"
```

---

## Task 3: Redirect anonymous payment attempts to login without losing the cart

**Files:**
- Modify: `tests/customer-account-ui.test.ts`
- Modify: `tests/cart-storage.test.ts` only if the existing persistence assertion is insufficient
- Modify: `components/cart-panel.tsx`
- Modify: `lib/server/customer-account-actions.ts`

- [ ] **Step 1: Change login-next sanitizer tests for the new storefront return path.**

`sanitizeCustomerLoginNext` must allow:

```ts
"/produtos"
"/produtos?categoria=decks"
```

and must no longer allow `/pedido/<token>`.

Keep rejecting absolute URLs, protocol-relative URLs, backslashes, `/admin`, `/pedido/...`, and unrelated paths.

- [ ] **Step 2: Add a source-level checkout UI regression assertion.**

In `tests/customer-account-ui.test.ts`, assert `components/cart-panel.tsx` handles `result?.code === "authentication_required"` by navigating to the local login URL:

```ts
/entrar?next=%2Fprodutos
```

and returns before the generic checkout error branch.

- [ ] **Step 3: Verify the existing cart persistence contract.**

Run:

```bash
node --experimental-strip-types --test tests/cart-storage.test.ts tests/customer-account-ui.test.ts
```

The sanitizer/UI test should be RED before implementation. The existing cart-storage test must remain GREEN and demonstrate the cart uses the stable `proxybembem-cart-v1` localStorage representation.

- [ ] **Step 4: Update the safe login-next sanitizer.**

Remove `PUBLIC_ORDER_PATH_RE` from `lib/server/customer-account-actions.ts`.

Allow only account paths plus the intended storefront continuation:

```ts
if (
  parsed.pathname === "/minha-conta" ||
  parsed.pathname.startsWith("/minha-conta/") ||
  parsed.pathname === "/produtos"
) {
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}
```

All other paths continue falling back to `/minha-conta`.

- [ ] **Step 5: Handle `authentication_required` in the cart before generic errors.**

Inside the existing `if (!response.ok)` branch in `CartPanel`:

```ts
if (result?.code === "authentication_required") {
  window.location.assign("/entrar?next=%2Fprodutos")
  return
}
```

Do not clear the cart. Do not serialize checkout data into the URL. Existing localStorage persistence keeps product lines through the login navigation.

- [ ] **Step 6: Run focused UI/account tests and confirm GREEN.**

```bash
node --experimental-strip-types --test tests/cart-storage.test.ts tests/customer-account-ui.test.ts tests/checkout-ui-state.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit the anonymous checkout UX.**

```bash
git add tests/customer-account-ui.test.ts tests/cart-storage.test.ts components/cart-panel.tsx lib/server/customer-account-actions.ts
git commit -m "feat: redirect anonymous checkout to login"
```

---

## Task 4: Preserve the exact private order URL when Mercado Pago returns after session expiry

**Files:**
- Modify: `tests/customer-auth.test.ts`
- Modify: `tests/customer-account-page-auth.test.ts`
- Modify: `tests/customer-account-ui.test.ts`
- Modify: `lib/server/customer-auth.ts`
- Modify: `app/minha-conta/layout.tsx`
- Modify: `app/minha-conta/pedidos/[id]/page.tsx`

- [ ] **Step 1: Add tests for an optional safe return path on the customer auth gate.**

Extend `requireCustomerPageAccessWithDependencies` tests so missing identity with:

```ts
"/minha-conta/pedidos/550e8400-e29b-41d4-a716-446655440000"
```

redirects to:

```text
/entrar?next=%2Fminha-conta%2Fpedidos%2F550e8400-e29b-41d4-a716-446655440000
```

Also assert an unsafe external next is sanitized back to `/minha-conta`.

- [ ] **Step 2: Update the page-auth source test to keep every leaf page self-protected.**

The account layout will stop being the first auth gate so it does not discard a page-specific `next`. The test must explicitly cover all leaf pages:

```ts
app/minha-conta/page.tsx
app/minha-conta/pedidos/page.tsx
app/minha-conta/pedidos/[id]/page.tsx
app/minha-conta/perfil/page.tsx
app/minha-conta/seguranca/page.tsx
```

For data-reading pages, authentication must still occur before the protected read.

- [ ] **Step 3: Run the focused tests and confirm RED.**

```bash
node --experimental-strip-types --test tests/customer-auth.test.ts tests/customer-account-page-auth.test.ts tests/customer-account-ui.test.ts
```

Expected: failures because the current gate always redirects to plain `/entrar` and the layout currently owns the redundant gate.

- [ ] **Step 4: Extend the customer auth gate with a safe `next`.**

In `lib/server/customer-auth.ts`, import `sanitizeCustomerLoginNext` and change the dependency helper and production wrapper to accept an optional `next`.

The redirect behavior should be:

```ts
const safeNext = sanitizeCustomerLoginNext(next)
return await deps.redirect(
  next
    ? `/entrar?next=${encodeURIComponent(safeNext)}`
    : "/entrar",
)
```

Verified identities still return immediately without redirect.

- [ ] **Step 5: Remove the redundant auth gate from `app/minha-conta/layout.tsx`.**

The layout should only render `AccountShell`. This is safe because every actual account leaf page is independently authenticated and tested. It also prevents the layout from intercepting `/minha-conta/pedidos/[id]` before that page can preserve its exact return URL.

- [ ] **Step 6: Make the order detail page provide its own canonical next path.**

Resolve params before the auth gate:

```ts
const { id } = await params
await requireCustomerPageAccess(`/minha-conta/pedidos/${id}`)
```

Then call `getOwnOrderById(id)` exactly as today. A different owner or nonexistent UUID remains `notFound()`.

- [ ] **Step 7: Run focused tests and confirm GREEN.**

```bash
node --experimental-strip-types --test tests/customer-auth.test.ts tests/customer-account-page-auth.test.ts tests/customer-account-ui.test.ts tests/customer-orders.test.ts
```

Expected: all pass.

- [ ] **Step 8: Commit the private return-path behavior.**

```bash
git add tests/customer-auth.test.ts tests/customer-account-page-auth.test.ts tests/customer-account-ui.test.ts lib/server/customer-auth.ts app/minha-conta/layout.tsx app/minha-conta/pedidos/[id]/page.tsx
git commit -m "feat: preserve private order return after login"
```

---

## Task 5: Remove the public order and guest-claim application surfaces

**Files:**
- Delete: `app/pedido/[token]/page.tsx`
- Delete: `components/account/order-claim-form.tsx`
- Delete: `app/api/account/orders/claim/route.ts`
- Delete: `lib/server/customer-order-claim.ts`
- Delete if unused after public page removal: `components/order-status.tsx`
- Delete if unused after public page removal: `lib/order-display.ts`
- Replace/Delete: `tests/customer-order-claim.test.ts`
- Delete if its only subject is removed code: `tests/order-display.test.ts`
- Create: `tests/private-order-only.test.ts`
- Modify: `lib/server/orders.ts`
- Modify: `lib/server/rate-limit.ts`
- Modify: `tests/customer-account-actions.test.ts`

- [ ] **Step 1: Add a RED regression test that requires public order surfaces to be absent.**

Create `tests/private-order-only.test.ts` with an `exists()` helper and assert all of these are absent:

```ts
"../app/pedido/[token]/page.tsx"
"../components/account/order-claim-form.tsx"
"../app/api/account/orders/claim/route.ts"
"../lib/server/customer-order-claim.ts"
```

Also inspect source strings and assert:

```ts
assert.doesNotMatch(checkoutFlow, /\/pedido\//)
assert.match(checkoutFlow, /\/minha-conta\/pedidos\//)
assert.doesNotMatch(accountActions, /PUBLIC_ORDER_PATH_RE|\/pedido\//)
```

Assert `lib/server/orders.ts` no longer exports `getOrderByPublicToken` after cleanup.

- [ ] **Step 2: Run the new regression test and confirm RED.**

```bash
node --experimental-strip-types --test tests/private-order-only.test.ts
```

Expected: failure because the public/claim files still exist.

- [ ] **Step 3: Delete the guest/public application files.**

Delete the four required public/claim files. Search active application imports with:

```bash
rg -n "OrderStatus|toOrderDisplayData|getOrderByPublicToken|OrderClaimForm|customer-order-claim|account/orders/claim|account-claim" app components lib tests --glob '!docs/**'
```

After the public page is removed, delete `components/order-status.tsx` and `lib/order-display.ts` if the search confirms they have no remaining application consumer, and remove `tests/order-display.test.ts` with them.

- [ ] **Step 4: Remove dead public-token lookup code but keep the database field.**

Delete only the `getOrderByPublicToken()` function from `lib/server/orders.ts`. Keep `OrderRecord.public_token`, `CreateOrderInput.publicToken`, token generation, and insert persistence for now because the database column is still `NOT NULL`.

- [ ] **Step 5: Remove the dead claim rate-limit scope.**

Remove `"account-claim"` from `RateLimitScope` and `LIMITS` in `lib/server/rate-limit.ts`. Update `tests/customer-account-actions.test.ts` so its approved account policies no longer expect that scope.

Do not touch the Postgres `claim_guest_order_for_customer` function in this deployment; it becomes unreachable from the application and will be removed during pre-launch database hardening.

- [ ] **Step 6: Replace the old claim test suite with private-only assertions.**

Delete `tests/customer-order-claim.test.ts` after `tests/private-order-only.test.ts` covers the intended absence. Do not keep tests that require obsolete public behavior.

- [ ] **Step 7: Run the targeted removal regression set.**

```bash
node --experimental-strip-types --test tests/private-order-only.test.ts tests/customer-account-actions.test.ts tests/customer-account-ui.test.ts tests/customer-orders.test.ts tests/orders.test.ts tests/checkout-flow.test.ts
```

Expected: all pass.

- [ ] **Step 8: Commit the removal.**

```bash
git add -A app/pedido components/account/order-claim-form.tsx app/api/account/orders/claim lib/server/customer-order-claim.ts components/order-status.tsx lib/order-display.ts tests/customer-order-claim.test.ts tests/order-display.test.ts tests/private-order-only.test.ts lib/server/orders.ts lib/server/rate-limit.ts tests/customer-account-actions.test.ts
git commit -m "refactor: remove guest order flow"
```

---

## Task 6: Run complete regression verification and update durable project status

**Files:**
- Modify: `docs/superpowers/CURRENT_STATUS.md`

- [ ] **Step 1: Verify the exact KingHost runtime locally/CI.**

```bash
node --version
```

Expected exactly:

```text
v22.1.0
```

- [ ] **Step 2: Run the full static and build verification.**

```bash
pnpm typecheck
pnpm build:kinghost
```

Expected: both exit 0.

- [ ] **Step 3: Verify route manifest privacy.**

After the build:

```bash
node -e "const m=require('./.next/server/app-paths-manifest.json'); if(Object.keys(m).some(k=>k.startsWith('/pedido/'))) process.exit(1); if(!m['/minha-conta/pedidos/[id]/page']) process.exit(2); console.log('private-order-route-contract-ok')"
```

Expected:

```text
private-order-route-contract-ok
```

- [ ] **Step 4: Run the entire test suite.**

```bash
pnpm test
```

Expected: zero failures.

- [ ] **Step 5: Update `CURRENT_STATUS.md` with facts only.**

Record:

- signup confirmation/login real E2E passed on KingHost;
- authenticated checkout/private-order architecture implemented in code;
- public order/guest claim surfaces removed from active application;
- `public_token`/claim RPC remain legacy database schema pending pre-launch cleanup;
- Task 14 is **not yet complete** until production acceptance after deployment verifies anonymous login gate, owned checkout return, and second-account UUID isolation;
- do not reapply already-applied password recovery migrations.

- [ ] **Step 6: Commit the verified status update.**

```bash
git add docs/superpowers/CURRENT_STATUS.md
git commit -m "docs: record authenticated checkout acceptance state"
```

- [ ] **Step 7: Confirm GitHub CI passes on the final HEAD before deployment.**

Required CI evidence: exact Node 22.1.0, frozen install, typecheck, KingHost build, startup smoke, and `pnpm test` all successful.

---

## Task 7: Deploy to KingHost and complete real acceptance without a real charge

**Files:** No code changes unless production evidence exposes a defect.

- [ ] **Step 1: Deploy the final verified branch HEAD on KingHost.**

Use the normal single-line SSH command:

```bash
cd ~/apps_nodejs/proxybembem && git pull --ff-only && nvm use && npx pnpm@10 install --frozen-lockfile && NODE_ENV=production npx pnpm@10 deploy:kinghost && git rev-parse HEAD
```

Restart `proxybembem` from the KingHost process authority/panel after deployment.

- [ ] **Step 2: Verify anonymous checkout behavior.**

In an anonymous browser:

1. Add a product.
2. Enter a valid delivery address/CEP.
3. Calculate/select freight.
4. Click payment.
5. Confirm the browser goes to `/entrar?next=%2Fprodutos` and no order/preference is created.
6. Log in and confirm the cart product lines are still present after returning to `/produtos`.

- [ ] **Step 3: Verify authenticated ownership without completing a real payment.**

With Account A logged in, initiate checkout only far enough to create the server-owned pending order/preference using the configured safe test/sandbox path. Do not submit a real paid transaction solely for acceptance.

Confirm in Supabase that the new test order has:

```text
customer_id = Account A auth UUID
customer_email = Account A verified email
```

and confirm it is visible in `Minha conta > Pedidos`.

- [ ] **Step 4: Verify the private order route and copied UUID isolation.**

Open Account A's `/minha-conta/pedidos/<uuid>` successfully. Then log in as Account B and paste the exact same UUID URL.

Expected for Account B: 404/not found with no order details.

- [ ] **Step 5: Verify the old public route no longer exposes data.**

Open the old synthetic test `/pedido/<token>` URL.

Expected: 404/not found; no products, totals, address, status, email, WhatsApp, or claim UI.

- [ ] **Step 6: Clean only the acceptance fixtures.**

Delete the synthetic Task 14 order and any dependent test-only `order_events`/attention rows created during acceptance. Do not perform the final all-data pre-launch wipe yet unless separately approved.

- [ ] **Step 7: Record production acceptance evidence.**

Only after Steps 2–6 pass, update `CURRENT_STATUS.md` to mark Task 14 complete. The later clean-slate deletion of all test accounts/orders and the schema-hardening migration remain a separate pre-launch operation.
