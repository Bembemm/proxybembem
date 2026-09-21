# Transactional Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build reliable transactional order e-mail with a durable Supabase outbox, bounded retries, signed Resend delivery webhooks, eight approved templates/triggers, and admin delivery history/manual resend.

**Architecture:** Keep notifications inside the existing modular monolith. Authoritative payment/fulfillment/shipment transitions persist notification intents in Supabase without calling Resend; a `CRON_SECRET`-protected worker claims due rows atomically and sends immutable payloads through a reusable Resend client; signed Resend/Svix webhooks update delivery state only. Admin reads and manual resend use the existing server-side admin/AAL2 boundary.

**Tech Stack:** Next.js 16.3.3 App Router, TypeScript 5.7.3, Node.js 22.x production runtime, hosted Supabase/Postgres 17, direct Resend HTTP API, Node `crypto` for Svix-compatible signature verification, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-12-transactional-notifications-design.md`

## Global Constraints

- Exactly eight notification types: `payment_approved`, `production_started`, `ready_to_ship`, `shipped`, `delivered`, `canceled`, `refunded`, `charged_back`.
- No order e-mail on unpaid order creation.
- Maximum automatic attempts: 3 total; retry no earlier than +5 minutes after attempt 1 and +30 minutes after attempt 2.
- Vercel worker cadence: every 5 minutes; batch size max 25.
- Stable provider idempotency key and immutable payload across automatic retries.
- Manual resend creates a new linked row with a new provider idempotency key and reuses the original immutable payload.
- `sent` means provider accepted; `delivered` requires a trusted Resend webhook.
- No open/click tracking behavior.
- `delivered` order notification is created only from trusted Phase 5 carrier delivery evidence, never from generic admin completion.
- Payment/refund/chargeback truth remains Mercado Pago; notification failures never alter payment, fulfillment, or shipment state.
- Browser `anon`/ordinary `authenticated` roles get no notification-outbox CRUD.
- Security-definer SQL uses `set search_path = ''`, schema-qualified names, explicit revoke/grant.
- Existing password recovery Resend behavior and security tests remain green.
- Production runtime remains exactly Node.js 22.x; raw TypeScript tests run under the existing Node 24 CI test step.

---

### Task 1: Durable notification outbox foundation

**Files:**
- Create: `supabase/migrations/202609120001_transactional_notifications_foundation.sql`
- Create: `tests/transactional-notifications-migration.test.ts`

**Interfaces:**
- Consumes: existing `public.orders`, `public.admin_audit_log`, service-role-only RPC pattern.
- Produces: `public.notification_outbox`, `public.notification_webhook_events`, `public.claim_due_notification_outbox(integer,uuid,integer)`, `public.complete_notification_attempt(...)`, `public.record_notification_webhook(...)`, `public.admin_list_order_notifications(uuid)`, `public.admin_resend_order_notification(uuid,uuid,uuid)`.

- [ ] **Step 1: Write the failing migration contract test**

Create a Node test that reads the new migration and asserts all of these behaviors: RLS enabled on both tables; revoke from `public, anon, authenticated`; allowlisted type/status checks; unique non-null `dedupe_key`; indexes for due jobs, order history, provider message id, webhook id; security-definer RPCs with empty search path; claim uses `for update skip locked`; batch bound `1..25`; stale processing lease is reclaimable; completion caps automatic attempts at 3 and uses 5/30-minute retry schedule; manual resend copies `recipient_email`, `template_payload`, and `notification_type`, sets `resend_of_id`, creates a fresh provider idempotency key, and records an admin audit row; webhook events are uniquely consumed by `svix_id` and update only by stored provider message id.

Representative assertions:

```ts
assert.match(sql, /create table[^;]+notification_outbox/is)
assert.match(sql, /alter table public\.notification_outbox enable row level security/i)
assert.match(sql, /for update skip locked/i)
assert.match(sql, /least\(greatest\(p_limit,\s*1\),\s*25\)/i)
assert.match(sql, /interval '5 minutes'/i)
assert.match(sql, /interval '30 minutes'/i)
assert.match(sql, /attempt_count\s*>=\s*3/i)
assert.match(sql, /resend_of_id/i)
assert.match(sql, /unique[^;]+svix_id/is)
assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete|all)[^;]+to\s+(?:anon|authenticated)/i)
```

- [ ] **Step 2: Commit the test only and verify RED in CI**

Commit only `tests/transactional-notifications-migration.test.ts`. Push branch and confirm CI fails because the migration file/contract is missing.

- [ ] **Step 3: Implement the minimal foundation migration**

Create private operational tables and RPCs. Store only bounded customer-safe payload and bounded error fields; do not store CPF, raw provider payload, secrets, or internal order metadata. Use UUID keys from `gen_random_uuid()` and a generated stable `provider_idempotency_key` per row. Claim only `pending`/`retry_scheduled` plus expired `processing` rows whose `next_attempt_at <= now()`, set finite lease, and return at most 25 rows. Manual resend must reject an original row when an active manual resend (`pending`, `processing`, `retry_scheduled`) already exists.

- [ ] **Step 4: Verify GREEN**

Push migration implementation and confirm migration test and full CI pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add notification outbox foundation`.

### Task 2: Reusable Resend transactional client

**Files:**
- Create: `lib/server/resend-client.ts`
- Modify: `lib/server/recovery-email.ts`
- Create: `tests/resend-client.test.ts`
- Verify: `tests/password-recovery-flow.test.ts`, `tests/password-recovery-durable-grant.test.ts`

**Interfaces:**
- Produces `sendResendEmail(input)` returning `{ outcome: 'accepted', messageId } | { outcome: 'retryable' | 'rejected', code }` without raw response leakage.
- `sendResendEmail` accepts `to`, `subject`, `text`, `html`, and optional `idempotencyKey`; sender is fixed to `ProxyBembem <noreply@proxybembem.com.br>`.

- [ ] **Step 1: Write failing provider-client tests**

Test endpoint, Bearer auth, JSON content type, fixed sender, HTML+text, `Idempotency-Key` when supplied, bounded timeout behavior, 2xx accepted parsing, 4xx definite rejection, 429/5xx/network/timeout retryable classification, malformed successful response as retryable/uncertain, and no raw body in returned errors.

- [ ] **Step 2: Verify RED**

Run/push tests and confirm failure because `resend-client.ts` does not exist.

- [ ] **Step 3: Implement minimal client and refactor recovery**

Move API key lookup/provider fetch into the shared client. Preserve recovery URL HTTPS validation and existing subject/copy. Recovery may translate non-accepted outcomes back to the existing generic `Recovery email provider request failed` error.

- [ ] **Step 4: Verify GREEN and recovery regressions**

Run `resend-client`, password recovery tests, then full CI.

- [ ] **Step 5: Commit**

Commit message: `refactor: share Resend transactional client`.

### Task 3: Customer-safe immutable notification templates

**Files:**
- Create: `lib/server/order-notification-templates.ts`
- Create: `tests/order-notification-templates.test.ts`

**Interfaces:**
- Produces `ORDER_NOTIFICATION_TYPES`, `isOrderNotificationType`, `buildOrderNotificationPayload(type, snapshot)`, and `renderOrderNotification(payload)`.
- Immutable payload contains only fields needed by the approved template: order id/number, safe item lines, cents, safe address strings, carrier/service/tracking where relevant, and the authenticated order path.

- [ ] **Step 1: Write failing template tests**

Cover all eight subject/meaning pairs; payment-approved items/subtotal/shipping/total/address; shipped optional carrier/service/tracking; canceled copy never claims refund; refunded and charged-back copy differ; HTML escaping of item/name/address/tracking; BRL cents formatting; production URL is `https://www.proxybembem.com.br/minha-conta/pedidos/{uuid}`; reject invalid UUID/path and unexpected notification type; assert prohibited fields such as CPF/payment id/provider raw metadata never render.

- [ ] **Step 2: Verify RED**

Confirm missing module failure.

- [ ] **Step 3: Implement minimal typed projection/rendering**

Use explicit field pickers and HTML escaping; never stringify the whole source order object.

- [ ] **Step 4: Verify GREEN**

Run template tests and full CI.

- [ ] **Step 5: Commit**

Commit message: `feat: add transactional order email templates`.

### Task 4: Outbox repository, worker, and cron route

**Files:**
- Create: `lib/server/notification-outbox.ts`
- Create: `lib/server/notification-worker.ts`
- Create: `app/api/internal/notifications/process/route.ts`
- Create: `tests/notification-outbox.test.ts`
- Create: `tests/notification-worker.test.ts`
- Create: `tests/notification-cron.test.ts`

**Interfaces:**
- `claimDueNotifications({ workerId, limit })` calls the claim RPC.
- `completeNotificationAttempt(...)` calls the completion RPC.
- `processNotificationBatch({ workerId, limit, send })` claims up to 25 rows, renders immutable payload, sends via Resend, and finalizes each result.
- Cron route accepts only `Authorization: Bearer <CRON_SECRET>` using the existing timing-safe secret pattern and returns only counts/booleans.

- [ ] **Step 1: Write failing repository/worker/route tests**

Assert strict response parsing; no browser credentials; one send per claimed row; stable stored idempotency key forwarded; retryable vs rejected completion mapping; a malformed row is failed safely without exposing content; max 25; cron rejects bad secret; response omits e-mail/body/provider id; no sensitive logging.

- [ ] **Step 2: Verify RED**

Confirm modules/routes are absent.

- [ ] **Step 3: Implement minimal repository/worker/route**

Use service-role REST RPC calls with `cache: 'no-store'`, 10-second bounded DB requests, and existing `getCronSecret()`.

- [ ] **Step 4: Verify GREEN**

Run focused tests and full CI.

- [ ] **Step 5: Commit**

Commit message: `feat: process transactional notification outbox`.

### Task 5: Signed Resend webhook ingestion

**Files:**
- Modify: `.env.example`
- Modify: `lib/server/env.ts`
- Create: `lib/server/resend-webhook.ts`
- Create: `app/api/webhooks/resend/route.ts`
- Create: `tests/resend-webhook.test.ts`

**Interfaces:**
- `getResendWebhookSecret()` returns a strong server-only secret.
- `verifyResendWebhook({ rawBody, id, timestamp, signature, secret, now })` performs Svix-compatible HMAC-SHA256 verification with bounded timestamp tolerance and timing-safe comparison.
- Handler accepts only operational `email.sent`, `email.delivered`, `email.bounced`, `email.failed`, `email.suppressed`, extracts trusted `data.email_id`, and records through the database RPC.

- [ ] **Step 1: Write failing signature/handler tests**

Generate test signatures with Node `crypto`; cover valid signature, wrong secret/body/id/timestamp, stale timestamp, missing headers, replayed `svix-id` treated idempotently by repository result, unknown/opened/clicked event ignored without business mutation, and provider row match by email id only.

- [ ] **Step 2: Verify RED**

Confirm missing module/route failure.

- [ ] **Step 3: Implement minimal webhook path**

Read `request.text()` before JSON parse, verify signature first, parse bounded object second, never log raw payload, and return quickly.

- [ ] **Step 4: Verify GREEN**

Run webhook/env tests and full CI.

- [ ] **Step 5: Commit**

Commit message: `feat: ingest signed Resend delivery webhooks`.

### Task 6: Authoritative notification enqueue triggers

**Files:**
- Create: `supabase/migrations/202609120002_transactional_notification_triggers.sql`
- Create: `tests/transactional-notification-triggers.test.ts`

**Interfaces:**
- Consumes authoritative `order_events`, `shipment_events`, `orders`, and `shipments` rows.
- Produces one durable automatic outbox row per approved logical event with deterministic dedupe key and immutable safe payload.

- [ ] **Step 1: Write failing trigger contract tests**

Assert mappings: Mercado Pago `payment_status_changed + approved/refunded/charged_back`; admin fulfillment transition to `in_production`, `ready_to_ship`, `canceled`; authoritative shipment `shipment_posted` or trusted tracking transition to posted creates `shipped`; trusted tracking transition to delivered creates `delivered`; generic admin `completed` does not create delivered; label purchase/generation/cart events do not enqueue shipped; pending checkout/order creation has no mapping. Assert payload selects explicit safe columns and contains no CPF/payment id/raw event metadata.

- [ ] **Step 2: Verify RED**

Confirm migration absent.

- [ ] **Step 3: Implement trigger functions**

Use database triggers on append-only authoritative event tables so enqueue occurs in the same transaction as the event insert. For order-event mapping, guard exact source/event metadata combinations. For shipment-event mapping, use only Phase 5 posted/tracking evidence. Build deterministic dedupe keys from source event identifiers and use `on conflict (dedupe_key) do nothing`.

- [ ] **Step 4: Verify GREEN**

Run migration tests and full CI.

- [ ] **Step 5: Commit**

Commit message: `feat: enqueue order notifications from authoritative events`.

### Task 7: Admin notification history and manual resend

**Files:**
- Create: `lib/server/admin-order-notifications.ts`
- Create: `lib/server/admin-order-notification-actions.ts`
- Create: `app/api/internal/admin/orders/[id]/notifications/[notificationId]/resend/route.ts`
- Modify: `app/admin/pedidos/[id]/page.tsx`
- Create: `tests/admin-order-notifications.test.ts`
- Create: `tests/admin-order-notification-actions.test.ts`

**Interfaces:**
- `listAdminOrderNotifications(orderId)` returns sanitized chronological rows.
- POST resend handler uses `authorizeAdminAccess({ touch: true })`, same-origin POST boundary, then `admin_resend_order_notification` RPC.

- [ ] **Step 1: Write failing repository/action tests**

Cover UUID validation, status/type allowlists, sanitized response mapping, no raw template/provider payload, same-origin/AAL2 owner auth, POST-only action, explicit resend creates linked row through RPC, conflict when an active resend already exists, and no-store behavior.

- [ ] **Step 2: Verify RED**

Confirm missing repository/action/route.

- [ ] **Step 3: Implement minimal server repository/action and UI section**

Render chronological rows with Portuguese status labels, attempt count, timestamps, bounded failure category, automatic/manual badge, and an explicit `Reenviar e-mail` form on eligible rows. Do not add a separate admin attention flag.

- [ ] **Step 4: Verify GREEN**

Run admin tests and full CI.

- [ ] **Step 5: Commit**

Commit message: `feat: add admin notification history and resend`.

### Task 8: Rollout docs, hosted migration, and final verification

**Files:**
- Modify: `.env.example`
- Modify: `docs/deployment/vercel.md`
- Modify: `docs/superpowers/CURRENT_STATUS.md`
- Verify all Phase 6 tests plus existing CI suite.

**Interfaces:**
- Production needs `RESEND_WEBHOOK_SECRET` and existing `CRON_SECRET`/`RESEND_API_KEY`.
- Vercel cron calls `/api/internal/notifications/process` every 5 minutes.
- Resend webhook points to `/api/webhooks/resend` and subscribes only to operational Phase 6 event classes.

- [ ] **Step 1: Write/update documentation contract tests if existing docs tests enforce env/cron keys**

Assert docs mention the new webhook secret, five-minute cron, route, and no open/click events.

- [ ] **Step 2: Apply the foundation and trigger migrations to hosted Supabase only after code-level migration tests are green**

Use the connected Supabase project, then query catalog/ACL/RLS/function metadata to verify tables, grants, indexes, function search paths, and trigger presence. Run Supabase security and performance advisors and fix Phase 6 regressions.

- [ ] **Step 3: Run full verification**

CI must pass exact Node.js 22.x typecheck, `build`, private-order route contract, Vercel runtime smoke, and full TypeScript tests.

- [ ] **Step 4: Production configuration/acceptance boundary**

Configure `RESEND_WEBHOOK_SECRET`, register only operational webhook events, and add the five-minute Vercel cron. Do not manufacture real payment/refund/chargeback solely for acceptance. Use an owner-selected safe order/event path for live acceptance.

- [ ] **Step 5: Record runtime SHA and Phase 6 acceptance**

Update current status only after hosted schema verification, provider callback verification, admin status/manual resend acceptance, and owner acceptance.
