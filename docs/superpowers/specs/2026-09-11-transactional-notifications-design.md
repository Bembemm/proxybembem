# Phase 6 — Transactional Notifications Design

**Date:** 2026-09-11  
**Branch:** `feat/transactional-notifications`  
**Base:** `main`  
**Runtime:** KingHost Node.js 22.1.0 + hosted Supabase  
**Provider:** Resend

## Goal

Add production-capable transactional e-mail notifications for order/payment/production/shipping events without coupling customer-facing e-mail delivery to the success of Mercado Pago, fulfillment or Melhor Envio operations.

The system must be durable, deduplicated, retryable, auditable and visible from the protected admin order detail. It must reuse the existing Resend integration and the existing order/event authority instead of introducing a second order-state model.

## Approved product decisions

The owner approved the following behavior on 2026-09-11:

- the first order e-mail is sent only after Mercado Pago confirms payment `approved`; no e-mail is sent merely because checkout created a pending order;
- include transactional e-mails for payment approved, production started, ready to ship, shipped, delivered, canceled, refunded and charged back;
- cancellation and refund are separate events;
- `refunded` is presented as **Reembolso concluído**;
- `charged_back` is presented separately as **Pagamento revertido**;
- shipped e-mail includes tracking code when available and a button to the authenticated order page;
- payment-approved e-mail includes items, quantities, total and delivery address;
- admin order detail shows notification delivery state and offers **Reenviar e-mail**;
- automatic delivery performs at most three provider-send attempts for one logical delivery before final failure;
- track delivery/bounce/failure operational events, not opens or clicks;
- architecture is Supabase outbox + worker in the existing app + Resend.

## Non-goals

Phase 6 does not add marketing campaigns, automated WhatsApp, open/click tracking, customer notification-preference management, automatic Mercado Pago refunds, automatic order cancellation, or any automatic Melhor Envio label purchase. Password recovery remains its own auth flow.

## Existing system boundaries

The current application already has the pieces Phase 6 should build on:

- `orders` is the authoritative order snapshot and already contains customer e-mail, items, prices, address and shipping selection;
- `order_events` is append-only and records authoritative payment and fulfillment transitions with dedupe keys;
- Mercado Pago payment changes are applied through `apply_mercadopago_payment_event` and recorded as `payment_status_changed` events;
- admin fulfillment changes are recorded as `fulfillment_status_changed` events;
- Melhor Envio posting/tracking also records fulfillment changes; trusted `delivered` tracking can move an order from `shipped` to `completed`;
- the customer order page is authenticated and owner-scoped at `/minha-conta/pedidos/{uuid}`;
- Resend is already used server-side for password recovery via `RESEND_API_KEY` and `ProxyBembem <noreply@proxybembem.com.br>`;
- KingHost already has a protected internal-cron pattern using `CRON_SECRET`, Bearer or `X-CRON-AUTH`.

Phase 6 must preserve those authorities. An e-mail failure must never roll back or falsify a payment, fulfillment or shipment state.

## Architecture

### 1. Database outbox

Create a new Phase 6 migration with backend-only notification tables. Browser roles receive no direct table access.

Use three focused tables rather than one overloaded table.

### `order_notification_deliveries`

Represents one logical e-mail delivery.

Core fields:

- `id uuid primary key`;
- `order_id uuid not null references orders(id) on delete restrict`;
- `kind text not null` constrained to the eight approved kinds;
- `mode text not null` constrained to `automatic | manual`;
- `source_event_id uuid null references order_events(id) on delete restrict`;
- `manual_resend_of uuid null references order_notification_deliveries(id) on delete restrict`;
- `recipient_email text not null` as the validated order/customer e-mail used for this delivery;
- `status text not null` constrained to `queued | processing | retry_wait | sent | delivered | bounced | failed | attention`;
- `attempt_count smallint not null default 0`, bounded to 0..3;
- `next_attempt_at timestamptz null`;
- `claimed_at timestamptz null` for worker lease recovery;
- `provider_email_id text null` with a partial unique index when present;
- `provider_idempotency_key text not null unique`;
- `last_error_code text null` containing only bounded/safe categories, never provider payloads or secrets;
- transient `rendered_subject`, `rendered_text` and `rendered_html` fields used only while an automatic delivery is in `processing`/`retry_wait` so every retry sends the exact same payload;
- `sent_at`, `delivered_at`, `failed_at`, `created_at`, `updated_at` timestamps.

Automatic deliveries are deduplicated by source `order_events.id`. A unique partial index ensures one automatic delivery per supported source event. Manual resend is deliberately a new delivery row referencing the previous delivery; it is therefore auditable and intentionally allowed to send again.

The database does **not** retain rendered e-mail bodies as long-term audit data. The first worker claim renders a bounded message from trusted order/event/shipment data and stores the exact subject/text/HTML transiently. Retries reuse those exact stored bytes with the same provider idempotency key. After provider acceptance or any terminal `failed`/`attention` result, rendered bodies are cleared while safe metadata/history remains. This avoids payload drift across retries or deployments without creating a permanent second copy of address/item content.

Never persist CPF, provider payloads, auth tokens, raw webhook bodies or provider secrets in notification tables.

### `order_notification_attempts`

Records each Resend API attempt. A row is created when an attempt is claimed and may be completed exactly once with its outcome; completed attempt rows are never deleted or rewritten into a different attempt.

Fields include:

- delivery id;
- attempt number 1..3;
- started/completed timestamps;
- outcome `accepted | retryable_error | permanent_error | outcome_unknown`;
- HTTP status when safe/available;
- provider e-mail id when accepted;
- bounded error category only.

This table makes the automatic three-attempt rule, stale-worker recovery and manual troubleshooting visible without logging private response bodies.

### `order_notification_provider_events`

Stores only minimal verified webhook event metadata for dedupe/audit:

- stable webhook message identifier (`svix-id`) as unique key;
- provider e-mail id;
- supported event type;
- provider event timestamp;
- received timestamp.

Do not persist raw webhook bodies.

All three tables have RLS enabled, direct `public`, `anon` and `authenticated` access revoked, and least-privilege `service_role` grants only. Admin/customer access is through narrow server code/RPCs, never direct browser table reads.

## Event-to-notification mapping

The enqueue boundary is an `AFTER INSERT` trigger on `order_events`. This uses the existing append-only event ledger as the integration boundary and keeps notification creation in the same database transaction as the authoritative business event that caused it.

The trigger only reacts to the following exact event shapes:

| Order event | Condition | Notification |
| --- | --- | --- |
| `payment_status_changed` | `metadata.payment_status = approved` | `payment_approved` |
| `payment_status_changed` | `metadata.payment_status = refunded` | `refunded` |
| `payment_status_changed` | `metadata.payment_status = charged_back` | `charged_back` |
| `fulfillment_status_changed` | `metadata.to = in_production` | `production_started` |
| `fulfillment_status_changed` | `metadata.to = ready_to_ship` | `ready_to_ship` |
| `fulfillment_status_changed` | `metadata.to = shipped` | `shipped` |
| `fulfillment_status_changed` | `metadata.to = canceled` **and the order has a prior approved-payment event** | `canceled` |
| `fulfillment_status_changed` | `metadata.to = completed` **and source = shipment** | `delivered` |

The prior-approved-payment condition on cancellation preserves the approved decision that no order e-mail is sent before payment approval. An unpaid `awaiting_payment -> canceled` order therefore produces no customer notification. If an order was approved earlier and is later canceled, the cancellation message is eligible even if the financial status has already moved to a reversal state.

`completed` from a generic admin transition does **not** generate a delivered e-mail. Customer copy may only say the order was delivered when the completion came from trusted shipment/tracking evidence.

For an otherwise eligible event, the trigger verifies that the order has a valid non-empty customer e-mail. If not, it does not invent an address or block the source event; it creates an operational attention flag for the missing notification destination.

Unsupported order events do nothing.

## Delivery processing

### Worker

Add an internal route:

`GET /api/internal/notifications/process`

It reuses the existing constant-time `CRON_SECRET` authentication pattern and returns `Cache-Control: no-store`.

The worker processes a bounded batch of due deliveries. A database claim RPC selects eligible rows with row locking / `SKIP LOCKED`, moves them to `processing`, increments the attempt count atomically and prevents two workers from sending the same delivery concurrently.

New deliveries are due immediately (`next_attempt_at <= now()`); the durable cron worker is the only required send path. Payment/admin/shipment source requests do not call Resend directly and do not depend on notification delivery. Operationally, KingHost should invoke the worker at least every five minutes.

Retry eligibility is recorded in `next_attempt_at`; the target schedule is attempt 1 on the first worker pass, attempt 2 about five minutes after a retryable failure, and attempt 3 about thirty minutes after the second retryable failure. These are three total automatic send attempts, not three retries after the first attempt.

Automatic notifications for one order preserve source-event order: a later automatic event is not claimed while an older automatic delivery for that order remains `queued`, `processing` or `retry_wait`. Once the older delivery is terminal for application sending (`sent`, `delivered`, `bounced`, `failed` or `attention`), later events may proceed. Manual resend deliveries do not block the automatic event stream.

A processing lease prevents permanent stuck rows. A delivery left `processing` beyond a short bounded lease is treated as an uncertain attempt: the attempt is closed as `outcome_unknown`, and the delivery is moved to `retry_wait` with the same rendered payload/idempotency key if a safe retry remains inside the provider idempotency window. If safe retry is no longer possible, it becomes `attention` rather than triggering a blind duplicate.

### Resend request

Generalize the existing recovery-email provider code into a reusable server-only Resend client while keeping password-recovery behavior intact.

Every transactional send uses:

- `from: ProxyBembem <noreply@proxybembem.com.br>`;
- one validated recipient;
- both HTML and plain-text bodies;
- a provider timeout;
- `Idempotency-Key` set to the delivery's stable `provider_idempotency_key`;
- the exact transiently persisted subject/text/HTML for all retries of that delivery;
- no API key or provider response body in logs.

Resend currently supports idempotency keys for `POST /emails` and retains them for 24 hours. All automatic retries for one delivery therefore use the **same request payload and same idempotency key**, making network/timeout retries safe during that window.

A manual resend creates a new delivery and a new provider idempotency key because the operator is explicitly asking for another e-mail.

### Failure classification

- successful provider response with a valid e-mail id -> `sent`;
- validation/auth/permanent provider rejection -> `failed`, no automatic retry;
- rate limit, provider 5xx or documented concurrent-idempotency condition -> `retry_wait` if attempts remain;
- network/timeout after the request may have reached Resend -> `retry_wait` with the **same idempotency key and exact payload** if attempts remain and still inside the provider's 24-hour idempotency window;
- if an unknown outcome cannot be safely retried inside that window, mark `attention` rather than sending a blind duplicate;
- after attempt 3, a still-unsuccessful delivery becomes `failed` or `attention` according to whether the final outcome is definite or uncertain.

No notification error changes the order's payment, fulfillment or shipment state.

## Resend webhook

Add a public POST-only route:

`POST /api/resend/webhook`

Required behavior:

- read the raw request body before parsing;
- require `RESEND_WEBHOOK_SECRET`;
- verify the Resend/Svix signature using `svix-id`, `svix-timestamp` and `svix-signature` according to current Resend documentation;
- reject invalid signatures before any database mutation;
- deduplicate verified webhook messages by `svix-id`;
- locate the delivery by the stored provider e-mail id;
- accept only bounded, known provider event types;
- never trust recipient/order identifiers supplied by the webhook as authorization.

Subscribed/handled operational events:

- `email.delivered` -> `delivered`;
- `email.bounced` -> `bounced`;
- `email.failed` -> `failed`;
- `email.suppressed` -> `failed` with a safe suppression category;
- `email.delivery_delayed` may be recorded as provider event but remains non-terminal; it must not cause an application resend because Resend still owns that accepted delivery attempt.

Do not subscribe to or store `email.opened` or `email.clicked` for this phase.

Provider events may be duplicated or arrive out of order. Database application is monotonic: duplicate/stale events are harmless; `delivery_delayed` cannot downgrade a terminal state; and a recorded `delivered` state is never downgraded by a later stale bounce/failure event. Every accepted event is deduplicated by its webhook message id.

A bounce/failure after a provider-accepted send is not an excuse for automatic duplicate sending. It is surfaced to the admin; the owner may choose manual resend after correcting the destination/problem.

## E-mail templates

All templates share one simple ProxyBembem layout, escaped dynamic values, responsive HTML and a plain-text equivalent. The primary CTA uses the authenticated URL:

`/minha-conta/pedidos/{order.id}`

Production links are built from the validated public site URL and must use HTTPS.

### 1. Pagamento aprovado

Subject concept: `Pagamento aprovado — pedido {order_number}`

Include:

- customer first/name greeting when safe;
- order number;
- item titles, quantities and unit/subtotals;
- subtotal, shipping and total paid;
- delivery address from the immutable order snapshot;
- shipping service/carrier when present;
- **Ver meu pedido** CTA.

Do not send for `pending`, rejected checkout, abandoned checkout or `manual_review`.

### 2. Produção iniciada

Triggered only by transition to `in_production`.

Tell the customer the paid order started being prepared and link to the order. Do not promise a completion date that the system does not know.

### 3. Pronto para envio

Triggered only by transition to `ready_to_ship`.

Tell the customer production is complete and the order is waiting for posting. Buying/generating a Melhor Envio label does not itself trigger this message or a shipped message.

### 4. Pedido enviado

Triggered only by authoritative transition to `shipped`.

Include:

- carrier and service when known;
- tracking code when available at first render;
- current customer-safe shipment status when available at first render;
- **Acompanhar meu pedido** CTA.

The first render becomes the immutable retry payload for this delivery. If tracking data changes after a retryable provider failure, automatic retries keep the original payload so the Resend idempotency key remains valid. A later customer order-page view always shows current tracking.

For Melhor Envio, label purchase/generation/printing never counts as shipment. Existing Phase 5 rules remain unchanged.

### 5. Pedido entregue

Triggered only from a `completed` fulfillment event whose source is trusted shipment tracking.

Tell the customer delivery was reported by the carrier and link to order history. A generic admin `completed` action does not send this template.

### 6. Pedido cancelado

Triggered by an eligible operational transition to `canceled` after the order has previously had approved payment.

Explain that the order was canceled. If the current financial state is still approved, wording must not claim the money has already been returned. It should explain that financial reversal is separate and, when confirmed, another e-mail will be sent. If a refund/reversal was already authoritatively recorded, the cancellation copy may acknowledge that state without inventing settlement timing.

### 7. Reembolso concluído

Triggered only by Mercado Pago-confirmed `payment_status = refunded`.

State that the payment provider confirmed the refund. Avoid promising the exact card/bank posting date because settlement visibility depends on the payment method/provider/issuer.

### 8. Pagamento revertido

Triggered only by Mercado Pago-confirmed `payment_status = charged_back`.

Keep wording distinct from refund and factual: the payment was reversed by the payment flow/provider. Link to the order and support path; do not call it a customer-requested refund.

## Admin order detail

Add a **Notificações** section to `/admin/pedidos/{id}` using protected server reads.

Each delivery shows:

- notification type;
- recipient address;
- created/sent time;
- current status label;
- attempt count;
- last safe failure category when applicable;
- whether the delivery was automatic or a manual resend.

Portuguese UI labels include:

- `Aguardando envio`;
- `Enviando`;
- `Aguardando nova tentativa`;
- `Enviado`;
- `Entregue`;
- `Rejeitado`;
- `Falhou`;
- `Requer atenção`.

### Manual resend

Expose `POST /api/internal/admin/orders/{id}/notifications/{deliveryId}/resend`.

The route must preserve the standard admin boundary: immutable owner UUID, password/TOTP AAL2, active app session and same-origin mutation protection.

Manual resend:

- confirms the delivery belongs to the order;
- allows only an existing supported notification kind;
- revalidates that the order has a valid recipient e-mail;
- creates a **new** queued delivery with `mode = manual`, `manual_resend_of = previous id`, a new provider idempotency key and a fresh maximum of three attempts;
- writes an admin audit entry;
- never deletes or rewrites previous delivery/attempt history.

The UI requires an explicit confirmation before creating an intentional duplicate e-mail.

## Attention center integration

Phase 6 may create/resolve existing-style `order_attention_flags` with `source = notification` for cases that need action, for example:

- missing/invalid customer e-mail for an otherwise eligible notification;
- exhausted failed delivery;
- unsafe/expired unknown provider outcome;
- verified bounce/suppression.

A successful manual resend/delivery may resolve the corresponding active notification attention where appropriate. Never erase the historical failed delivery.

## Security and privacy

- `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` are server-only environment variables.
- Never expose provider secrets, raw webhook payloads, auth headers or API response bodies in logs/admin HTML.
- Notification tables are backend-only; no direct browser CRUD.
- Customer order URLs remain authenticated/owner-scoped; e-mail links do not introduce public token tracking.
- Never include CPF, sender tax identity, provider internal shipment/order ids, label resource URLs, TOTP/recovery material or internal attention metadata in e-mails.
- Escape all dynamic HTML content; reject malformed order/recipient data rather than interpolating it unsafely.
- Webhook verification occurs on the raw body and before parsing/mutation.
- Admin resend is a protected mutation and must not be callable from a customer session.
- Transient rendered e-mail content is retained only while required for a safe retry and is cleared at terminal send processing; it is never exposed through customer/browser APIs.

## Recovery e-mail compatibility

Password recovery already sends through Resend. Refactor the provider transport only as needed so recovery and order notifications can share a safe low-level sender/configuration helper.

Do not route password recovery through the order outbox in Phase 6. Recovery has its own scanner-safe auth/security flow and should remain behaviorally unchanged.

## Rollout

1. Add tests for migration/RLS/RPC/event-trigger contracts before migration implementation.
2. Apply the Phase 6 migration to the hosted Supabase project only after local migration tests are green.
3. Add the Resend transport/template/worker tests and implementation.
4. Add verified webhook tests before enabling a production Resend webhook endpoint.
5. Add admin notification history/manual resend tests and UI.
6. Run exact KingHost Node 22.1.0 install/typecheck/build/startup/full-suite verification.
7. Configure `RESEND_WEBHOOK_SECRET` and the production Resend webhook for only the approved operational events.
8. Configure/verify the protected KingHost notification worker schedule.
9. Perform controlled production acceptance using a deliberate test/real order chosen by the owner; do not alter unrelated customer orders.

No production label spending or payment/refund mutation is part of Phase 6 acceptance.

## Testing requirements

Automated coverage must include at minimum:

- exact allowed notification kinds/statuses;
- trigger mapping from authoritative `order_events`;
- no customer notification for an unpaid order canceled before approval;
- duplicate Mercado Pago/order/shipment events create only one automatic delivery;
- pending/manual-review payment does not send payment-approved e-mail;
- manual `completed` does not generate a delivered e-mail while trusted shipment completion does;
- outbox claim concurrency, per-order ordering and bounded batch behavior;
- stale processing lease recovery;
- three-attempt maximum and retry timing/state transitions;
- exact same Resend idempotency key and exact same rendered payload across retries;
- transient rendered payload is cleared after terminal send processing;
- manual resend creates a new delivery/idempotency key and leaves old history intact;
- network/timeout unknown outcome never causes blind duplicate behavior outside the safe idempotency window;
- HTML escaping and no prohibited private fields in templates;
- shipped template includes tracking when available and still renders safely without it;
- payment-approved template uses trusted order totals/items/address;
- cancellation copy does not claim refund;
- refunded and charged-back templates remain distinct;
- raw-body webhook signature verification occurs before event processing;
- duplicate/out-of-order webhooks are idempotent/monotonic;
- delivered/bounced/failed/suppressed mapping;
- opened/clicked events are neither subscribed to nor used by the application;
- direct browser roles cannot read/write notification tables;
- admin notification reads/resend require the accepted admin authorization/session/origin boundary;
- customer ownership/private-order behavior is unchanged;
- recovery-email regression remains green.

## Acceptance criteria

Phase 6 is complete when:

- all eight approved transactional notification kinds are driven by authoritative events, while an unpaid cancellation remains silent;
- no customer order e-mail is sent before authoritative payment approval;
- outbox/dedupe/retry survives provider/network/process failure without blocking order-state changes;
- a delivery has at most three automatic provider-send attempts;
- Resend idempotency and stable payloads prevent safe retries from duplicating an e-mail;
- verified Resend webhooks update delivered/bounced/failed state monotonically;
- open/click tracking is absent;
- admin order detail exposes notification state/history and protected manual resend;
- financial refund/chargeback wording reflects Mercado Pago state without being inferred from cancellation;
- no notification path weakens private-order, admin, Mercado Pago or Melhor Envio security invariants;
- hosted migration, deployment configuration and production smoke are recorded factually without fabricated provider evidence.

## Provider references checked during design

- Resend Send Email API: `https://resend.com/docs/api-reference/emails/send-email`
- Resend idempotency keys: `https://resend.com/docs/dashboard/emails/idempotency-keys`
- Resend webhooks/features: `https://www.resend.com/features/webhooks`
- Resend webhook verification/API changelog: `https://resend.com/changelog/managing-webhooks-via-api`
