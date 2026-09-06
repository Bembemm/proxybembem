# Authenticated Checkout and Private Orders Design

Date: 2026-09-06

## Context

ProxyBembem has not launched publicly yet. There are no real customer purchases that need backward compatibility, and the current accounts/orders are test data that can be removed before launch.

The current checkout supports both authenticated and guest buyers. A guest order receives a 64-character public token and Mercado Pago returns the buyer to `/pedido/[token]`. That public page can render order status/details and offers a later “claim this order” flow for a matching verified account.

This creates unnecessary complexity and privacy exposure for the intended production model. The chosen UX is:

- browsing and adding products to the cart remain public;
- shipping quotes remain public;
- authentication is required only when the customer starts payment;
- every newly created order belongs to the authenticated customer from creation time;
- order status/details are visible only inside the authenticated account;
- Mercado Pago returns directly to the authenticated order detail page;
- there is no guest-order claim flow and no public order-status page in the production UX.

## Goals

1. Require a verified customer account before creating a checkout/order.
2. Preserve the current low-friction public catalog, cart and freight calculation experience.
3. Make the server authoritative: bypassing client UI must not allow a guest checkout.
4. Bind every new order to `auth.users.id` and the verified account email.
5. Return from Mercado Pago to `/minha-conta/pedidos/[id]` rather than `/pedido/[token]`.
6. Keep order contents, delivery address, status and timeline private to the owner.
7. Remove guest-order claim UI/API from the active product flow.
8. Preserve checkout idempotency, freight revalidation, Mercado Pago webhook validation, payment state handling and admin behavior.
9. Keep the cart intact across a login redirect so a customer does not lose their selected products.

## Non-goals

- No social login or passwordless login.
- No guest checkout fallback.
- No public order lookup by order number.
- No compatibility bridge for real historical guest orders, because the site has not launched.
- No change to Mercado Pago webhook trust rules or fulfillment transitions.
- No Phase 4 work.

## Architecture

### 1. Client checkout gate

The cart remains usable without authentication. The customer can:

- add/remove products;
- enter delivery information;
- calculate and select freight.

When `CartPanel` sends the final `POST /api/checkout`, the API is the authoritative authentication gate. If the API returns an explicit authentication-required response, the client redirects to `/entrar` with a safe `next` pointing back to the storefront/current page.

The cart is already client state and must remain preserved through authentication. The implementation must verify the existing persistence behavior; if necessary, only the minimum persistence change needed for this flow will be added. We will not copy cart contents into query parameters or authentication metadata.

The login page returns to the safe `next` path after successful login. The customer can reopen the cart and continue payment with the existing items.

### 2. Authoritative checkout authentication

`POST /api/checkout` must require a verified customer identity before creating or reusing a checkout attempt.

The route must use the existing Supabase server identity path and reject unauthenticated/unverified requests with a stable response such as:

```json
{
  "error": "Entre na sua conta para continuar o pagamento.",
  "code": "authentication_required"
}
```

with HTTP `401` and `Cache-Control: no-store`.

The checkout flow must no longer accept a nullable customer identity. A valid `CustomerIdentity` becomes required input.

The submitted checkout email must not be an independent authority. The verified account email is authoritative. To avoid confusing data mismatches, the checkout form may display/prefill the account email, but the server must always persist the verified identity email. If the payload email differs from the authenticated email, checkout is rejected rather than silently linking a different email.

### 3. Order ownership at creation

Every new order must be created with:

- `customer_id = authenticated user id`;
- `customer_email = authenticated verified email`.

`customer_id` must never be `NULL` for new checkout-created orders.

The existing idempotent checkout attempt behavior remains unchanged: an existing attempt may be reused only if its fingerprint matches. Ownership is part of the security boundary; reused attempts must not allow one authenticated customer to reuse another customer's order.

Implementation must therefore ensure the checkout attempt lookup/reuse path validates ownership, not only fingerprint/checkout URL.

### 4. Private Mercado Pago return URL

The checkout reservation must expose the order UUID internally to the checkout flow. The Mercado Pago preference return URL becomes:

```text
/minha-conta/pedidos/{order-id}
```

for success, pending and failure returns.

No public token is required for navigation after payment.

If the customer's login session has expired while they are on Mercado Pago, opening the private order route should redirect to `/entrar?next=/minha-conta/pedidos/{order-id}` and, after login, return to that order. The order page continues enforcing ownership, so a different account receives the same not-found behavior as any missing/non-owned order.

### 5. Remove public order flow

`/pedido/[token]` is removed from the active application rather than maintained as a compatibility page.

The following guest/public-order surfaces are removed or made unreachable:

- public order page;
- `OrderClaimForm`;
- `/api/account/orders/claim`;
- guest-order claim calls from the customer account flow;
- UI text that asks the customer to “add” a guest order to their account.

The private `/minha-conta/pedidos/[id]` page becomes the only customer-facing order-details/status surface.

No private address, email, WhatsApp, order items or payment status may be rendered from an unauthenticated order URL.

### 6. Public token/database transition

The database currently has `orders.public_token` as a required field and a guest-claim RPC. Removing that column in the same application deployment would create an avoidable deployment-order hazard.

For this implementation:

- `public_token` may remain as an internal legacy storage field temporarily;
- it must not be returned to the customer, used in Mercado Pago return URLs, or used by active UI navigation;
- new product behavior must not depend on it;
- guest claim APIs/UI are removed from the application.

Before public launch, after test data is deleted, a clean-slate database-hardening migration can remove the unused public-token/guest-claim schema and strengthen customer ownership constraints without needing to preserve historical guest data.

This deliberately separates user-visible/security behavior from destructive schema cleanup and avoids a production deployment race.

## Data Flow

### Anonymous shopper

1. Browse catalog.
2. Add products to cart.
3. Enter address/CEP.
4. Obtain and select server-signed freight quote.
5. Click payment.
6. `POST /api/checkout` returns `401 authentication_required`.
7. Browser redirects to login with safe `next`.
8. Cart remains available after login.

No order or Mercado Pago preference is created before successful authentication.

### Authenticated shopper

1. Customer is logged in with confirmed email.
2. Cart sends checkout payload and selected quote.
3. Server validates identity, origin, body, customer data and freight quote.
4. Server verifies checkout email matches verified account email.
5. Server creates/reuses an order owned by that account.
6. Server creates/reuses Mercado Pago preference.
7. Mercado Pago back URLs target `/minha-conta/pedidos/{order-id}`.
8. Browser goes to Mercado Pago.
9. Mercado Pago/webhook updates payment state as today.
10. Customer returns to the private order detail page.

### Unauthorized order access

For `/minha-conta/pedidos/{id}`:

- no session -> login redirect with safe return path;
- owner session -> render order;
- different customer -> 404/not found;
- nonexistent UUID -> same 404/not found behavior.

This prevents order-ID enumeration from revealing whether an order belongs to another customer.

## Security Requirements

- Authentication must be enforced server-side in `/api/checkout`.
- Only a verified Supabase user is accepted as checkout identity.
- Client-supplied email cannot choose order ownership.
- New checkout orders always receive the authenticated user ID.
- Checkout attempt reuse must be scoped to/validated against the same customer.
- Customer order detail continues to use server-side ownership filtering/RLS-backed RPC behavior.
- Checkout/auth/private responses remain `no-store`/private and must not rely on browser caching for correctness.
- The public order route must not remain as an alternate path to sensitive order data.
- Mercado Pago webhook behavior stays independent of browser sessions and continues using provider verification.

## Error Handling / UX

- Anonymous payment attempt: friendly login redirect rather than a generic checkout failure.
- Session expires between cart and payment: same login redirect; cart remains.
- Authenticated checkout email mismatch: show a clear message that checkout must use the account email; do not create an order.
- Session expires during Mercado Pago: private return URL redirects to login and back to that exact order after authentication.
- Different account opens copied order UUID: 404/not found.
- Provider/freight/idempotency failures keep the existing specific checkout messages.

## Testing Strategy

Implementation follows TDD and must cover at minimum:

1. `POST /api/checkout` rejects anonymous users with `401` and `authentication_required` before creating an order/preference.
2. Unverified/invalid identity cannot checkout.
3. Authenticated identity is required by `executeCheckoutFlow`.
4. Payload email mismatch with account email is rejected.
5. New order always receives `customer_id` and verified `customer_email`.
6. Existing checkout attempt owned by another account cannot be reused.
7. Mercado Pago preference return URL is `/minha-conta/pedidos/{order-id}`.
8. Client handles `authentication_required` by routing to login rather than showing a generic payment error.
9. Public `/pedido/[token]` and guest claim UI/API are absent from the active build.
10. Private order detail still renders for owner and returns not-found for another customer.
11. Existing checkout freight/idempotency/payment/webhook tests continue passing.
12. Typecheck, KingHost build, startup smoke and full tests pass in CI.

## Production Acceptance

Before declaring this change complete on KingHost:

1. Anonymous shopper can fill cart/freight but is sent to login when starting payment.
2. After login, cart contents remain available.
3. Authenticated checkout creates an order already visible in `Minha conta > Pedidos`.
4. Mercado Pago return lands on `/minha-conta/pedidos/{id}` (a safe non-charged/sandbox acceptance path may be used; no real payment is required for validation).
5. A second account cannot open the first account's copied order UUID.
6. `/pedido/<old-test-token>` no longer reveals order data.
7. Test fixtures are cleaned after acceptance.

## Pre-launch Cleanup

Because the site is not yet public, immediately before launch we may delete all test-only accounts/orders/events/flags/recovery grants and other fixtures, then apply any final schema hardening that depends on a clean database. This cleanup must not delete configuration/operational tables required by Mercado Pago, Melhor Envio or admin authentication unless explicitly identified as test-only.
