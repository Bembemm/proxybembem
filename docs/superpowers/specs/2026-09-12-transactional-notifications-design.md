# Phase 6 — Transactional Notifications Design

**Date:** 2026-09-12  
**Branch:** `feat/transactional-notifications`  
**Base:** `main`  
**Runtime:** KingHost Node.js 22.1.0 + hosted Supabase  
**Provider:** existing Resend integration (`RESEND_API_KEY`)  
**Status:** owner-approved design, ready for implementation planning

## Goal

Add reliable, production-capable transactional order e-mail to the existing modular monolith without making e-mail delivery part of the authoritative payment, fulfillment, shipment, or refund transaction.

The system must survive temporary provider/network failures, avoid duplicate sends, expose operational delivery state to the admin, and preserve the current security boundaries around Mercado Pago, Melhor Envio, Supabase Auth, customer-owned orders, and admin AAL2 authorization.

Marketing mail and automated WhatsApp are explicitly out of scope.

## Owner decisions

The owner approved the following behavior:

- reuse the existing Resend provider and sender identity; do not add SMTP/another provider;
- the first order e-mail is sent only after payment is confirmed approved, not when checkout/order reservation is created;
- include notifications for payment approved, production started, ready to ship, shipped, delivered, canceled, refunded, and charged back;
- cancellation and refund are separate events;
- `refunded` is presented as **Reembolso concluído**;
- `charged_back` is presented separately as **Pagamento revertido**;
- shipped e-mail includes tracking information when available and a link to the authenticated customer order page;
- payment-approved e-mail includes item summary, amounts, and delivery address;
- admin order detail shows notification delivery state and allows an explicit manual resend;
- automatic sending retries at most three total attempts before terminal failure;
- delivery and bounce/failure state are tracked through provider webhooks;
- open/click tracking is not used by this feature;
- selected architecture: Supabase outbox + worker in the existing application + Resend.

## Non-goals

Phase 6 does not:

- send an e-mail merely because an unpaid order exists;
- alter payment status, fulfillment status, shipment status, refund state, or carrier state based on e-mail delivery;
- infer refund from cancellation;
- infer delivery from an arbitrary admin action when trusted carrier delivery evidence is available;
- send marketing campaigns, newsletters, abandoned-cart mail, or automated WhatsApp;
- expose full CPF, payment provider identifiers, Melhor Envio provider internals, raw webhook payloads, API keys, or internal audit metadata to the customer;
- replace Supabase Auth confirmation/recovery e-mails;
- add a second application/runtime solely for notifications;
- add a separate admin attention flag for notification failure in this phase; the notification history itself is the operational surface.

## Architecture

Phase 6 stays inside the existing modular monolith and adds four focused units:

1. **Notification outbox persistence** — durable queue and status history in hosted Supabase.
2. **Notification projection/template layer** — builds customer-safe immutable message payloads from trusted order/shipment state.
3. **Delivery worker** — bounded server-side processor invoked by an internal `CRON_SECRET`-protected route and scheduled by KingHost.
4. **Provider webhook ingestion** — authenticated Resend webhook route that updates delivery outcomes without trusting unsigned payloads.

Order/payment/fulfillment/shipment code only enqueues a durable notification intent. It never needs Resend to succeed before the business operation succeeds.

## Source-of-truth boundaries

Existing authorities remain unchanged:

- Mercado Pago is authoritative for financial payment state.
- Existing fulfillment transitions are authoritative for production/ready/shipped/canceled state.
- Trusted Melhor Envio/carrier tracking remains authoritative for shipment delivery evidence.
- Supabase Auth/server identity remains authoritative for customer ownership.
- The notification subsystem is authoritative only for e-mail delivery state.

A notification failure must never roll back or rewrite an otherwise valid payment, fulfillment, shipment, cancellation, refund, or chargeback event.

## Notification types and triggers

The initial allowlist is exactly:

### `payment_approved`

Trigger only when trusted payment processing records the transition to Mercado Pago `approved`.

Customer subject/copy meaning: **Pagamento aprovado**.

Content:

- order number;
- items and quantities;
- subtotal;
- shipping amount;
- total paid;
- delivery address from the immutable order snapshot;
- authenticated **Ver meu pedido** link.

Do not enqueue on initial pending order creation.

### `production_started`

Trigger on the authoritative fulfillment transition into production.

Customer meaning: **Seu pedido entrou em produção**.

Content is concise and links to the order page.

### `ready_to_ship`

Trigger on the authoritative fulfillment transition to `ready_to_ship`.

Customer meaning: **Seu pedido está pronto para envio**.

Do not imply the parcel has already been posted.

### `shipped`

Trigger only when authoritative fulfillment becomes `shipped`, through explicit trusted posting/acceptance behavior already defined by Phase 5.

Customer meaning: **Seu pedido foi enviado**.

Content:

- carrier when available;
- service when available;
- tracking code when available;
- authenticated **Acompanhar meu pedido** link.

Buying/generating/printing a label must not enqueue this notification by itself.

### `delivered`

Trigger when trusted shipment reconciliation records delivery and the accepted order flow reaches the delivered/completed state.

Customer meaning: **Seu pedido foi entregue**.

The trigger must use the same trusted carrier evidence already used by Phase 5. A generic admin-only state change must not fabricate carrier delivery evidence.

### `canceled`

Trigger when the order is authoritatively canceled operationally.

Customer meaning: **Seu pedido foi cancelado**.

Copy must not claim the payment has already been refunded unless a separate trusted financial reversal exists. When money was captured, the e-mail states that financial processing is separate and that a separate message will be sent if/when a refund is confirmed.

### `refunded`

Trigger only when trusted Mercado Pago state becomes `refunded`.

Customer meaning: **Reembolso concluído**.

Do not synthesize this event from local cancellation.

### `charged_back`

Trigger only when trusted Mercado Pago state becomes `charged_back`.

Customer meaning: **Pagamento revertido**.

Do not label this as an ordinary refund.

## Durable outbox model

Add a private notification outbox table owned by backend/service-role flows. Browser roles must have no direct mutation access.

Each row represents one intended customer e-mail delivery and contains at minimum:

- primary UUID;
- `order_id` FK;
- allowlisted notification type;
- recipient e-mail snapshot;
- immutable bounded customer-safe template payload;
- deterministic dedupe key;
- provider idempotency key;
- provider message ID when known;
- status;
- attempt count;
- `next_attempt_at`;
- processing claim/lease metadata;
- last bounded error class/code suitable for admin display;
- timestamps for created, last attempted, sent, delivered, bounced/failed, and terminal failure as applicable;
- manual resend lineage (`resend_of_id`) when a human explicitly creates a new send.

The table must not store provider API keys, webhook secrets, full raw provider payloads, CPF, or raw internal order event metadata.

### Status model

Use a bounded state machine equivalent to:

```text
pending
processing
sent
delivered
retry_scheduled
failed
bounced
```

`sent` means Resend accepted the message, not that the recipient received it. `delivered` requires a trusted provider webhook. A bounce/provider failure can transition an accepted message to `bounced`/`failed` as appropriate.

Admin-facing Portuguese labels:

- `pending` → Pendente
- `processing` → Enviando
- `sent` → Enviado
- `delivered` → Entregue
- `retry_scheduled` → Aguardando nova tentativa
- `failed` → Falhou
- `bounced` → Rejeitado/Bounce

## Deduplication and idempotency

Automatic notifications must be at-most-once per logical order event from the application's point of view.

Use both layers:

1. a unique database dedupe key preventing duplicate outbox rows for the same logical automatic event; and
2. Resend's `Idempotency-Key` request header for provider-side retry safety.

The Resend idempotency key must be stable for all automatic retries of one outbox row and the message payload must remain identical for those retries.

Because Resend retains idempotency keys for a limited provider window, the database uniqueness constraint remains the long-term duplicate-prevention authority.

A manual admin resend is intentionally a **new** delivery. It creates a new outbox row with a new provider idempotency key, links back to the original row through `resend_of_id`, and reuses the original immutable customer-safe template payload. It never overwrites the historical row and never silently changes the message meaning based on newer order state.

## Retry behavior

Maximum automatic attempts: **3 total attempts**.

Retry schedule:

- attempt 1: first worker opportunity after enqueue;
- attempt 2: no earlier than 5 minutes after a retryable attempt-1 failure;
- attempt 3: no earlier than 30 minutes after a retryable attempt-2 failure;
- after attempt 3 fails retryably, mark terminal `failed`.

Definite non-retryable provider rejection fails immediately and is not blindly retried.

Network timeouts, provider 5xx, and other outcome-uncertain failures must reuse the same Resend idempotency key and exact payload. This avoids duplicate messages when the original request may have reached the provider.

A worker crash/lease expiry must make the row safely reclaimable without changing the payload or provider idempotency key.

## Worker and scheduling

Expose an internal bounded processor route under the existing server-only/internal route convention.

Requirements:

- authenticate with the existing high-entropy `CRON_SECRET` timing-safe boundary;
- service-role/database access only;
- claim rows atomically so concurrent invocations cannot process the same row simultaneously;
- processing claims use a finite lease so crashed work can be reclaimed;
- bounded batch size: max 25 rows per invocation;
- process only rows whose `next_attempt_at <= now()` and whose state is eligible;
- no recipient addresses, message bodies, provider IDs, or PII in the route response;
- response contains only bounded counts/booleans suitable for cron observability;
- no logs containing e-mail bodies, customer address, API key, webhook secret, or raw provider payload.

KingHost cadence: every **5 minutes**.

The feature remains correct if a cron run is missed: rows stay durable and become eligible on the next invocation.

## Provider integration

Generalize the existing direct Resend HTTP integration currently used by password recovery into a reusable server-only transactional e-mail client while preserving the current recovery behavior.

Provider send requirements:

- endpoint remains server-side only;
- use existing `RESEND_API_KEY`;
- sender remains `ProxyBembem <noreply@proxybembem.com.br>` unless later changed by an explicit store-setting phase;
- send both HTML and text versions;
- include `Idempotency-Key` on every transactional order send;
- timeout remains bounded;
- return/record only the provider message identifier and a bounded result classification;
- never expose raw Resend responses to browsers/admin UI.

## Resend webhook ingestion

Add a public POST webhook endpoint dedicated to Resend delivery events.

Security requirements:

- read the raw request body before parsing;
- verify the official Resend/Svix signature using the provider's `svix-id`, `svix-timestamp`, and `svix-signature` headers plus a dedicated `RESEND_WEBHOOK_SECRET` environment value;
- reject invalid signatures;
- persist/uniquely consume `svix-id` so replayed/duplicate webhook deliveries are idempotent;
- match customer messages by trusted Resend `email_id`/stored provider message ID, never by recipient address alone;
- return quickly and never perform unrelated order mutations.

Subscribe only to these operational Resend event classes for Phase 6:

- `email.sent`;
- `email.delivered`;
- `email.bounced`;
- `email.failed`;
- `email.suppressed` when supported by the configured webhook event selection.

Do not subscribe application behavior to `email.opened` or `email.clicked`.

Webhook delivery state changes do not alter order/payment/fulfillment/shipment state.

## Templates and privacy

Create a shared ProxyBembem transactional e-mail shell and one bounded template function per notification type.

General rules:

- escape all customer/order text inserted into HTML;
- use BRL formatting from integer cents;
- include order number and clear current meaning;
- keep links on `https://www.proxybembem.com.br` in Production;
- customer order links point only to authenticated `/minha-conta/pedidos/{order_id}`;
- do not place auth/session tokens in e-mail URLs;
- no CPF, internal provider IDs, payment IDs, seller private address, raw metadata, internal attention flags, or admin notes;
- no marketing copy, tracking pixels, click-tracking requirement, or newsletter unsubscribe semantics in this transactional phase.

The payment-approved template uses the existing immutable order item/price/address snapshot. Later catalog edits must not change historical e-mail content for an already-enqueued message.

## Admin UI

Extend `/admin/pedidos/[id]` with a notification section instead of creating a disconnected operational page for the first version.

Show chronological entries with at least:

- notification name;
- recipient e-mail in normal admin-visible form;
- created/sent/delivered/failed timing as applicable;
- Portuguese status;
- attempt count;
- bounded failure reason category, without raw provider payload;
- whether the row is an automatic message or a manual resend.

### Manual resend

Provide an explicit **Reenviar e-mail** action on eligible notification rows.

Requirements:

- existing admin authorization, owner UUID, active app session, AAL2/TOTP and same-origin protections apply;
- POST-only mutation;
- explicit human action; no automatic mass resend;
- creates a new linked outbox row rather than overwriting history;
- reuses the original immutable customer-safe template payload;
- new provider idempotency key;
- audit record of who initiated the resend according to existing admin audit conventions;
- one active manual resend request per original notification at a time; repeated concurrent clicks dedupe at the database mutation boundary.

Manual resend does not reset automatic retry counters on the original row.

## Enqueue integration points

Enqueue at the same trusted server/database transition boundary that records each authoritative event, not from page renders or client reads.

Required property: if the authoritative transition is committed, exactly one corresponding automatic notification intent is durably recorded, even if Resend is unavailable.

Use database-level/RPC transactional insertion alongside the existing authoritative transition/event write wherever that transition already occurs in an RPC/database transaction. For provider reconciliation flows where the trusted external result is first normalized in application code, use a deterministic event-derived dedupe key and a single backend enqueue operation immediately after the authoritative state mutation; reconciliation retries must be safe because the dedupe key is deterministic.

Never enqueue from:

- customer page render;
- admin page render;
- repeated GET/read operations;
- label generation/printing alone;
- a browser-provided payment/status value.

## Failure behavior

A terminal automatic notification failure is visible in the order's admin notification section. Phase 6 does not create a second attention-flag source for these failures.

The feature must not spam the customer while recovering from errors. Automatic retries are capped at three and use the same provider idempotency key/payload.

## Data access and RLS

Notification outbox/provider delivery records are private operational data.

- browser `anon` and ordinary `authenticated` roles receive no direct outbox table CRUD;
- customer order pages do not receive raw notification/provider history in Phase 6;
- service-role/backend owns enqueue/claim/send/webhook mutation paths;
- admin reads go through existing protected server-side admin access patterns;
- SQL functions used for mutation are fixed-`search_path`, narrowly granted, and service-role/admin-server only as appropriate;
- add indexes required for due-job claiming, order-history display, provider-message lookup, webhook-event dedupe, and notification dedupe uniqueness.

## Recovery e-mail compatibility

Existing password recovery already uses Resend and must keep working throughout the refactor.

Generalizing the provider client must preserve:

- current password-recovery subject/content semantics unless intentionally tested/changed;
- HTTPS recovery URL validation;
- server-only `RESEND_API_KEY`;
- bounded provider timeout;
- current security tests that prohibit logging recovery tokens, e-mail secrets, and sensitive URLs.

Supabase Auth confirmation e-mail behavior is not migrated into the transactional outbox in Phase 6.

## Testing strategy

Implementation follows TDD.

Required automated coverage includes:

### Domain/outbox

- allowlisted notification types only;
- unique automatic dedupe behavior;
- manual resend creates distinct linked row and reuses immutable original payload;
- exactly three automatic attempts maximum;
- retry timestamps follow the chosen schedule;
- terminal/non-retryable classification;
- atomic claim prevents double worker processing;
- stale claim recovery is safe.

### Provider client

- correct Resend endpoint/auth/content type;
- stable `Idempotency-Key` across retries;
- HTML + text payload;
- timeout/network/4xx/5xx classification;
- no raw provider response leakage;
- existing recovery flow regression remains green.

### Templates

- all eight types render expected subject and semantic content;
- payment approved contains trusted snapshot items/amounts/address;
- shipped contains carrier/service/tracking when present;
- canceled never claims refund completion;
- refunded and charged-back copy remain distinct;
- HTML escaping and URL validation;
- prohibited sensitive fields never render.

### Trigger integration

- pending checkout/order creation does not enqueue an order e-mail;
- approved payment enqueues exactly one `payment_approved` intent;
- each fulfillment transition enqueues only its intended type;
- label purchase/generation alone does not enqueue `shipped`;
- trusted delivery transition enqueues `delivered` once;
- cancellation/refund/chargeback remain distinct and deduplicated.

### Webhook

- invalid signature rejected;
- valid operational event accepted;
- duplicate/replayed `svix-id` idempotent;
- event cannot update a row by recipient address alone;
- delivered/bounced/failed state transitions bounded;
- opened/clicked absent from subscribed application behavior;
- webhook never mutates order/payment/fulfillment/shipment state.

### Admin

- AAL2/owner/session/same-origin boundary on resend mutation;
- notification history sanitized;
- manual resend requires explicit POST action;
- concurrent repeated manual resend request dedupes;
- failure status/attempt counts visible;
- no-store on protected admin responses.

### CI/regression

Exact KingHost Node 22.1.0, frozen install, typecheck, `build:kinghost`, private order route contract, KingHost startup smoke, TypeScript tests and full `pnpm test` remain green.

## Rollout

1. Land schema/RLS/RPC foundation with no live sending trigger enabled until automated tests are green.
2. Apply hosted Supabase migration once and verify ACL/RLS/index/function ownership.
3. Deploy worker/provider/template code with automatic trigger integration controlled so historical orders are not backfilled accidentally.
4. Configure `RESEND_WEBHOOK_SECRET` and register the Production webhook endpoint for only the approved Phase 6 operational events.
5. Configure KingHost notification worker cron every 5 minutes using the existing `CRON_SECRET` boundary.
6. Run a controlled Production acceptance using an owner-selected safe order/event path; do not manufacture a real payment/refund/chargeback solely for testing without explicit authorization.
7. Verify admin status, provider acceptance/delivery callback, and manual resend on a safe controlled notification.
8. Record exact runtime SHA and owner acceptance before closing Phase 6.

## Acceptance criteria

Phase 6 is complete when all of the following are true:

- the eight approved notification types exist with the agreed trigger semantics;
- unpaid order creation sends no order e-mail;
- automatic event enqueue is durable and deduplicated;
- Resend retries are duplicate-safe through stable idempotency keys;
- no more than three automatic attempts occur;
- provider delivery/bounce/failure updates are signature-verified and idempotent;
- admin order detail exposes sanitized notification status and explicit manual resend;
- open/click tracking is absent from application behavior;
- payment/fulfillment/shipment authority remains unchanged by notification outcomes;
- existing recovery e-mail behavior remains green;
- hosted migration/security checks and full CI pass;
- Production smoke is completed and explicitly accepted by the owner.
