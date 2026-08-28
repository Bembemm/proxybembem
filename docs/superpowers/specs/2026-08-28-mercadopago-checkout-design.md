# Mercado Pago Checkout Design

## Goal

Add a safe direct-purchase flow to ProxyBembem without collecting card data on the site. Product prices must be authoritative on the server, orders must be persisted before redirecting to payment, and payment status must only be accepted after server-to-server confirmation from Mercado Pago.

## Scope

The first version keeps the current lightweight store model: no customer accounts, no admin panel, and no automated freight quote. The customer pays for products through Mercado Pago Checkout Pro; freight remains explicitly marked as calculated/combined in the post-purchase WhatsApp service until a dedicated freight integration is added.

## Architecture

- Next.js Route Handlers create Mercado Pago Checkout Pro preferences server-side.
- The browser submits only product IDs, quantities, name, WhatsApp and CEP. It never submits or controls authoritative prices.
- The server resolves product IDs against `data/products.ts`, validates quantities and customer fields, and calculates totals in integer cents.
- Orders are stored in Supabase Postgres through the server only. No Supabase secret is exposed to client code.
- Mercado Pago credentials remain server-side environment variables.
- The webhook validates Mercado Pago's `x-signature` HMAC, fetches the payment from Mercado Pago's API, verifies `external_reference`, and updates the matching order.
- The return page reads the order by an unguessable public token and displays the database status. Query-string payment status is never trusted.
- The existing WhatsApp order flow remains as a fallback until production payment credentials are configured and as a support channel after payment.

## Cart integrity

The runtime cart may continue exposing full product objects to UI components, but persisted cart data stores only `productId` and `quantity`. On hydration, products are re-resolved from the current catalog. Legacy persisted carts may be migrated by reading only their product ID and quantity and discarding stored title/price fields.

The checkout API independently re-resolves every item from the catalog. Even if a user edits localStorage or the request payload, the server determines the title and price that are sent to Mercado Pago.

## Order model

Table: `public.orders`

- `id uuid primary key default gen_random_uuid()`
- `order_number text unique not null` — human-facing `PB-...` identifier
- `public_token text unique not null` — random token used only for the customer status URL
- `customer_name text not null`
- `whatsapp text not null`
- `cep text not null`
- `items jsonb not null` — immutable snapshot of product ID/title/unit price/quantity at checkout creation
- `subtotal_cents integer not null check (subtotal_cents >= 0)`
- `payment_provider text not null default 'mercadopago'`
- `preference_id text`
- `payment_id text`
- `payment_status text not null default 'pending'`
- `payment_status_detail text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

RLS is enabled and browser roles receive no table privileges. All access uses the server-side Supabase secret key.

## Checkout flow

1. Customer opens cart and enters name, WhatsApp and CEP.
2. Client calls `POST /api/checkout` with `{ items: [{ productId, quantity }], customer: { nome, whatsapp, cep } }`.
3. Server validates the request, resolves current catalog data, computes subtotal, generates `order_number` and `public_token`, and inserts an order with `payment_status='pending'`.
4. Server creates a Mercado Pago preference with BRL items, `external_reference=order_number`, HTTPS `notification_url`, and back URLs pointing to `/pedido/<public_token>`.
5. Server stores the returned preference ID and returns Mercado Pago's redirect URL to the browser.
6. Browser redirects to Mercado Pago Checkout Pro.
7. Mercado Pago redirects the customer back after checkout. The page displays only status read from the server-side order record.
8. Mercado Pago sends payment webhooks. The webhook validates its signature, fetches the payment from Mercado Pago, validates the order reference and amount, then updates payment status.

## Payment status rules

Persist Mercado Pago payment states as received, with the primary UI mapping:

- `approved` => paid
- `pending` / `in_process` / `authorized` => awaiting confirmation
- `rejected` / `cancelled` => not approved
- `refunded` / `charged_back` => refunded/reversed
- unknown values => awaiting/manual review

An order is never marked paid based solely on a return URL query parameter or client request.

For an `approved` payment, the webhook additionally verifies that `transaction_amount` equals the order `subtotal_cents / 100`. A mismatch is stored as `manual_review` rather than `approved`.

## Security

- Secrets: `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
- Optional `NEXT_PUBLIC_SITE_URL` supplies the canonical public HTTPS origin. Production checkout rejects localhost notification URLs.
- Supabase secret and Mercado Pago access token never appear in `NEXT_PUBLIC_*` variables.
- Webhook signature uses HMAC-SHA256 over Mercado Pago's documented manifest and constant-time comparison.
- Webhook payment data is fetched from Mercado Pago after signature validation; notification body fields are not treated as payment truth.
- Quantity is a positive integer and capped to avoid abusive orders.
- Customer input has explicit length/format limits.
- Database errors and provider errors return generic messages to the browser; detailed failures are logged server-side without secrets.

## UX

- Replace the primary cart action with `Finalizar compra com Mercado Pago`.
- Show a loading state while a checkout session is created.
- Clearly state before payment that the displayed amount covers products and freight is calculated separately in service.
- Keep a secondary WhatsApp fallback.
- `/pedido/<public_token>` shows the real payment status, order number, item summary and a WhatsApp button that includes the order number for sending the deck/list after payment.

## Testing and rollout

- Type-check and production-build the branch.
- Keep `main` unchanged until review.
- Add an environment example and setup guide for Supabase migration, Mercado Pago test credentials and webhook configuration.
- Test with Mercado Pago test credentials first. Per Mercado Pago documentation, test payments do not generate normal payment webhooks, so webhook reception must also be tested using the provider's webhook simulator.
- Only switch to production credentials after the business/account is confirmed as eligible and the complete flow has been manually exercised.