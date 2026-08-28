# ProxyBembem — Shipping, Checkout, and Production Security Design

Date: 2026-08-28
Status: Approved in chat, pending written-spec review before implementation planning
Target branch: `feat/checkout-mercadopago`

## 1. Goal

Make the current direct checkout production-ready while adding freight calculation through Melhor Envio without coupling the implementation to the current 100-card deck product.

The finished flow must support:

- multiple products and quantities in the cart;
- product-specific shipping weight and dimensions;
- automatic packing/volume calculation by Melhor Envio;
- full customer shipping address before payment;
- carrier/service selection based only on services actually returned for the origin/destination;
- exact freight price returned by Melhor Envio, with no extra handling fee;
- product subtotal + freight charged together in Mercado Pago Checkout Pro;
- manual label purchase in Melhor Envio after payment approval;
- server-side validation of all prices and payment state;
- atomic payment-status transitions;
- checkout abuse and duplicate-request protection;
- production security hardening and current copy/docs cleanup;
- Preview/Sandbox verification before any production rollout.

The implementation must remain on the feature branch/PR until explicitly approved for merge.

## 2. Confirmed business decisions

### 2.1 Shipping provider and scope

Melhor Envio will be used for freight quotation.

The site will show all valid shipping services returned by Melhor Envio for the order, rather than limiting the store to Correios only. Availability depends on the configured account, origin, destination, package characteristics, and the provider environment.

Origin CEP for quotation:

- `86730000`

This value must be configured server-side, not embedded in browser code.

### 2.2 Label purchase

The site will **not** automatically buy freight labels in the first production version.

After a payment is approved, the seller will manually create/buy/print the shipment in Melhor Envio using the order information saved by the site.

This intentionally separates quotation/payment from shipment purchasing and avoids accidental API purchases.

### 2.3 Freight amount charged to the buyer

The buyer pays exactly the freight amount returned by Melhor Envio.

Packaging and handling costs remain incorporated into product prices and are not added as a shipping surcharge.

### 2.4 Current product shipping estimate

Until the packed order can be measured with a scale, the current 100-card deck uses provisional shipping metadata:

- weight: `0.25 kg`;
- length: `25 cm`;
- width: `19 cm`;
- height: `4 cm`.

These are test/temporary values. Shipping metadata must be centralized per product so the values can be changed later without redesigning the integration.

## 3. Shipping architecture

### 3.1 Product shipping metadata

Each catalog product will define its own shipping characteristics, at minimum:

- weight;
- length;
- width;
- height.

The shipping model must support different products and quantities without special-casing the current deck.

The browser must never be authoritative for product price or shipping metadata. It sends product identifiers and quantities; the server rebuilds the cart from the trusted catalog.

### 3.2 Packing strategy

Use Melhor Envio's product-based quotation flow and let Melhor Envio calculate the packages/volumes for the full order.

The application must not implement its own general bin-packing algorithm in this version.

The integration must preserve the returned package/volume snapshot for the order when available so historical orders retain the exact shipping context used at checkout.

### 3.3 Quote endpoint

Add a server endpoint dedicated to shipping quotation, conceptually:

- `POST /api/shipping/quote`

Input from the browser:

- destination address/CEP data required for quotation;
- cart item IDs and quantities.

Server responsibilities:

1. validate request shape and size;
2. rebuild products/quantities from the trusted catalog;
3. construct the Melhor Envio product payload using server-side shipping metadata;
4. use the configured origin CEP;
5. query Melhor Envio;
6. normalize only valid available services into a browser-safe response;
7. expose service identifier, carrier/service name, price, estimated delivery time, and other minimal presentation data;
8. never expose Melhor Envio credentials or raw sensitive provider responses.

The UI sorts/presents the returned available services so the buyer can choose between price/speed options.

### 3.4 Revalidation before payment

A previously displayed browser quote is never trusted as the final amount.

When checkout is submitted, the browser sends only the selected service identifier together with the cart/customer/address data. The checkout backend re-queries/revalidates Melhor Envio using the trusted cart and address.

If the selected service is no longer available, checkout stops and the customer is asked to choose again.

If the freight price changed, checkout must not silently charge the new amount. It returns a clear "shipping updated" response with the new quote so the buyer can confirm again.

Only after an unchanged/confirmed quote is accepted may the Mercado Pago preference be created.

## 4. Customer address flow

The checkout collects the complete delivery address before payment.

Required fields:

- CEP;
- street;
- number;
- neighborhood;
- city;
- state/UF.

Optional field:

- complement.

Existing customer fields remain subject to validation, including name and WhatsApp.

The UI may use CEP lookup/autofill for convenience, but the server remains authoritative for validation. Autofill failure must not make it impossible to enter a valid address manually.

The complete address must not be placed in public URL query parameters or analytics event payloads.

## 5. Order and database model

Existing orders must remain compatible with the migration. New shipping fields should be nullable/defaulted where necessary for historical test rows.

An order will distinguish at least:

- product subtotal in cents;
- shipping amount in cents;
- final total in cents;
- shipping provider (`Melhor Envio`);
- selected carrier;
- selected service ID/name;
- estimated delivery time/range;
- destination address snapshot;
- shipping quotation/volume snapshot needed for fulfillment/audit;
- Mercado Pago preference/payment fields already used by the checkout.

Product subtotal, shipping and total must be stored separately so order pages and webhook validation are explicit.

Historical orders must retain the quote/address snapshot from their purchase even if catalog weights, dimensions, product prices, or shipping settings change later.

Add database constraints/indexes where they strengthen invariants without breaking existing data, including uniqueness for provider identifiers when logically valid.

## 6. Checkout total and Mercado Pago

The Mercado Pago amount is the order's final trusted total:

`product subtotal + shipping amount`

The preference can represent freight explicitly so the user can understand the charge, but the server-calculated final total is authoritative.

The browser cannot submit trusted values for:

- product unit price;
- product subtotal;
- freight price;
- final total.

The server derives all of them.

The checkout response must only redirect to a validated HTTPS Mercado Pago checkout URL on an allowed Mercado Pago host.

## 7. Payment webhook and atomicity

The order page remains database-backed. URL parameters such as `?status=approved` never mark an order as paid.

The Mercado Pago webhook must:

1. validate required webhook identifiers/headers;
2. verify HMAC before processing untrusted webhook JSON where the payload is not needed to identify the payment;
3. fetch the authoritative payment from Mercado Pago;
4. validate the order reference;
5. validate currency;
6. validate the paid amount against the order **final total including freight**;
7. apply the payment state transition atomically in PostgreSQL/Supabase.

### 7.1 Atomic payment transition

The current read-then-PATCH sequence is vulnerable to concurrent notifications.

Replace it with an atomic database operation, preferably a PostgreSQL function/RPC restricted to the service role, or another compare-and-set transaction mechanism that provides equivalent correctness.

The transition must preserve the existing safety rules:

- approved payments are tied to the expected payment identity;
- duplicate notifications are idempotent;
- inconsistent payment IDs are not allowed to overwrite an approved order;
- refund/chargeback/reversal transitions remain explicit and protected;
- suspicious mismatches can enter manual review rather than silently overwrite trusted state.

Provider identifiers such as payment ID should receive database uniqueness protection where appropriate.

## 8. Idempotency and abuse protection

### 8.1 Duplicate checkout prevention

Add checkout idempotency so double-clicks, client retries, or network retries do not create unnecessary duplicate orders/preferences.

The idempotency mechanism must be server-enforced and scoped so a genuine new checkout can still be created intentionally.

### 8.2 Rate limiting

Protect checkout creation and other provider-costly endpoints from abuse.

The implementation should prefer infrastructure already available to the project (Vercel/Supabase) rather than introducing a new paid dependency unless necessary.

The final implementation plan must choose a concrete rate-limit mechanism after checking what is available in the project's current Vercel/Supabase setup.

Rate limiting is additive to normal validation; it is not a substitute for server-side price verification.

### 8.3 Request limits

Do not rely solely on `Content-Length`, because clients may omit it.

Apply a real body-size limit to checkout requests and reject oversized/invalid payloads before expensive provider calls.

Provider IDs and other inputs must also receive reasonable length/format limits before being used in external API calls.

## 9. Environment separation and secrets

Credentials must remain server-only.

No Mercado Pago, Supabase service credential, Melhor Envio client secret/access token, webhook secret, or equivalent credential may be exposed in client-side bundles, repository files, logs, screenshots used for support, or API responses.

Use explicit environment separation for Preview/Sandbox versus Production.

The Melhor Envio Sandbox application/credentials are test-only. Production uses a clean production application and production credentials.

The origin CEP is configured as a server environment value, conceptually:

- `SHIPPING_ORIGIN_CEP=86730000`

Shipping package defaults/product metadata may live in the trusted server catalog/config where appropriate, because they are not secrets.

## 10. Origin and redirect hardening

Production checkout must use the canonical configured site origin rather than accepting arbitrary request origins.

Preview must remain usable for testing, but preview-origin allowances must not loosen Production rules.

Mercado Pago redirect URLs returned by the backend/client must be checked for HTTPS and an expected Mercado Pago hostname.

Public callback/webhook routes needed by Mercado Pago or Melhor Envio must remain reachable by those providers in the environment being tested. Preview Deployment Protection may need environment-specific handling during external webhook/OAuth tests.

## 11. Melhor Envio authentication/application

The Melhor Envio integration must follow the current official authentication flow for the selected environment.

A callback route may be added if required by the verified OAuth flow, for example:

- `/api/melhor-envio/callback`

Do not implement assumptions from stale documentation. Before coding the provider client, verify the current official Sandbox/Production base URLs, OAuth/token requirements, scopes, quote endpoint, request schema, and relevant response fields.

The application created in Melhor Envio Sandbox is for development/testing only.

## 12. Security headers and application hardening

Add production-appropriate HTTP security headers through Next.js configuration/middleware as appropriate, including:

- HSTS in production;
- `X-Content-Type-Options`;
- a restrictive `Referrer-Policy`;
- `Permissions-Policy`;
- a tested Content Security Policy;
- anti-framing protection through CSP `frame-ancestors` and/or compatible headers.

The CSP must be tested with the actual Next.js app and Vercel Analytics rather than copied from a generic template.

No security header should be added in a way that breaks checkout, fonts, images, analytics, or necessary provider navigation.

## 13. Dependency security

Before changing the Next.js version, verify current official Next.js security advisories and the appropriate patched release compatible with the project.

Then update `package.json`/lockfile to a safe compatible version and validate the complete project.

Do not upgrade unrelated dependencies merely for modernization.

## 14. User experience and failure behavior

### 14.1 Freight unavailable

If Melhor Envio is unavailable or returns no valid service for the origin/destination/order:

- do not create a Mercado Pago payment;
- show a clear retry/address-check message;
- preserve the cart/address state where practical.

### 14.2 Quote changed

If the selected service disappears or its price changes during checkout revalidation:

- do not silently continue;
- show the refreshed shipping options/value;
- require customer confirmation before payment creation.

### 14.3 Mercado Pago preference failure

If preference creation fails:

- never show the order as paid;
- retain a clear backend status/error state;
- allow a safe retry without accidental duplicate charging/order creation.

### 14.4 Successful order page

After approval, the order page should clearly present:

- order number;
- products/quantities;
- product subtotal;
- shipping price;
- total paid;
- shipping carrier/service;
- estimated delivery time;
- shipping address;
- payment status.

The approved state may continue clearing the local cart as it does today.

## 15. Fulfillment flow

After payment approval:

1. seller opens the paid order details;
2. seller uses the saved destination/service/package information to create the shipment manually in Melhor Envio;
3. seller buys the freight/label in Melhor Envio;
4. seller prints and attaches the label;
5. seller posts the package using the chosen carrier/service.

Automatic label purchase is explicitly outside the first implementation scope.

Future automation can be added without redesigning freight quotation because quotation/order data will already be modeled independently.

## 16. Legal/privacy-facing pages and copy

Add or update customer-facing pages for:

- Privacy;
- Terms;
- Exchanges/Refunds (or equivalent return/refund policy).

The privacy text should explain, in plain language, that order/contact/address information is used to process orders, Mercado Pago handles payment processing, and Melhor Envio is used for shipping quotation/fulfillment.

Do not place private seller CPF/home-address information into source code or request that it be shared in chat. Any legally required identification that is appropriate to publish must be supplied/configured separately by the seller.

The text must not falsely claim legal compliance or provide unsupported legal guarantees.

Update stale site copy, including statements that freight is calculated separately or that payment is only arranged by Pix/WhatsApp, so the site matches the direct Checkout Pro flow.

## 17. Documentation cleanup

Update payment/setup documentation so it matches actual implementation behavior, especially the current Mercado Pago checkout URL behavior and Preview/Sandbox setup.

Add Melhor Envio environment/setup documentation covering:

- Sandbox versus Production;
- required environment variable names without secret values;
- origin CEP configuration;
- OAuth/token setup as verified from official docs;
- quote-only/manual-label scope;
- test checklist.

`.env.example` may list variable names/placeholders but never real secrets.

## 18. Testing strategy

Implementation follows test-driven changes for business-critical behavior.

At minimum cover:

### Shipping

- one product quotation request;
- multiple quantities;
- multiple different products;
- product metadata comes from server catalog, not browser prices/dimensions;
- unsupported/unavailable services are handled;
- malformed address/CEP rejected;
- changed quote forces reconfirmation;
- selected-service tampering does not control price;
- provider errors do not create payments.

### Checkout

- product subtotal is rebuilt on server;
- shipping is added to final total;
- oversized/invalid request rejected;
- idempotent retry does not create duplicate checkout state;
- redirect host validation;
- production origin validation;
- Preview rules remain explicitly tested.

### Webhook/payment

- valid signature accepted;
- invalid signature rejected;
- malformed payment ID rejected before provider work;
- order reference mismatch rejected/reviewed appropriately;
- BRL/currency mismatch rejected;
- paid amount must equal final total including freight;
- duplicate webhook notifications are idempotent;
- concurrent/out-of-order transitions do not corrupt approved/reversed states;
- payment-ID mismatch cannot replace a trusted approved payment.

### UI/order page

- freight options show price and ETA;
- full address form validation;
- quote-refresh UX;
- subtotal, freight, total and service are rendered correctly;
- approved order page is based on database state, not return URL parameters.

### Project verification

Before claiming implementation complete, run at least:

- unit/integration test suite;
- TypeScript typecheck;
- production build;
- GitHub Actions CI on the final branch head.

## 19. Rollout plan

### Phase 1 — implementation on feature branch

All work stays on `feat/checkout-mercadopago` / the existing draft PR.

Do not merge to `main` during implementation.

### Phase 2 — Preview/Sandbox validation

Use:

- Vercel Preview;
- Melhor Envio Sandbox;
- Mercado Pago test-seller/test-buyer flow already used by the project;
- Supabase test rows in the current project unless a separate environment is introduced during planning.

Run a complete checkout:

1. build cart;
2. enter full address;
3. obtain freight choices;
4. select a service;
5. verify subtotal + freight + total;
6. complete test payment;
7. receive/validate webhook;
8. confirm database status becomes approved;
9. confirm order page shows the database-backed approved state and correct shipping/order details.

### Phase 3 — production preparation

Only after Preview/Sandbox passes:

- configure clean Production Melhor Envio credentials/application;
- configure real Mercado Pago Production credentials/webhook;
- configure Production canonical site URL/origin rules;
- configure Production shipping origin CEP;
- verify production security headers/CSP;
- verify customer-facing legal/privacy pages and operational copy;
- perform final code/security review.

No real purchase should be required merely to validate code changes before this phase.

### Phase 4 — merge/release

Merge to `main` only after the seller explicitly approves the tested/reviewed implementation.

## 20. Non-goals for this implementation

The following are intentionally excluded unless separately approved:

- automatic purchase/payment of Melhor Envio labels;
- automatic label printing;
- custom general-purpose packing/bin-packing algorithm;
- seller/admin dashboard beyond what is required to display/store the order data already in scope;
- unrelated visual redesign of the storefront;
- unrelated dependency/refactor work.

## 21. Success criteria

The design is successfully implemented when:

1. buyers can enter a full shipping address and receive valid freight options for the whole cart;
2. carts with multiple products/quantities are supported through product-level shipping metadata;
3. Melhor Envio determines the relevant volumes/services;
4. the selected freight is revalidated server-side before payment;
5. the buyer explicitly confirms any changed freight price;
6. Mercado Pago charges the trusted product subtotal plus trusted freight;
7. approved payments are validated against the final total and applied atomically;
8. duplicate checkout/webhook activity does not corrupt or unnecessarily duplicate orders;
9. order pages show trusted database state and full fulfillment information;
10. seller can manually buy the correct label after approval using saved order data;
11. secrets remain server-side and Preview/Production boundaries are explicit;
12. security headers, origin checks, rate limiting, request limits, dependency patching, docs and customer-facing policies are addressed;
13. tests, typecheck, build, CI and a full Preview/Sandbox purchase flow pass;
14. `main` remains untouched until explicit merge approval.
