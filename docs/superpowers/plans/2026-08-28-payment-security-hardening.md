# Payment Webhook and Production Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make payment-state updates concurrency-safe, validate payment totals including freight, lock checkout to trusted origins/redirect hosts, and add production-grade HTTP/dependency hardening without breaking Preview testing.

**Architecture:** Mercado Pago remains the source of truth for payment details, but PostgreSQL becomes the source of truth for state transitions through one row-locking RPC. Webhooks validate HMAC before parsing optional JSON, fetch the authoritative payment, and send only normalized values to the RPC. Application security is centralized in origin/URL validators and Next.js response headers, with Preview behavior explicitly separated from Production.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL PL/pgSQL/Supabase RPC, Mercado Pago REST API, Node `crypto`, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-28-shipping-checkout-security-design.md`

## Global Constraints

- Execute after `2026-08-28-checkout-orders-shipping.md` is complete and green.
- All work remains on `feat/checkout-mercadopago`; do not merge `main`.
- Order page/payment truth comes from Supabase, never Mercado Pago return URL parameters.
- Webhook approval amount must equal stored `total_cents`; legacy rows with null `total_cents` use `subtotal_cents` only for backwards-compatible test/history handling.
- Approved orders may only accept duplicate approval or refund/chargeback for the same payment ID.
- Conflicting payment IDs may not overwrite trusted approved/reversal states.
- Mercado Pago webhook HMAC is validated before optional JSON parsing/provider work.
- Production checkout requires the canonical configured HTTPS site origin.
- Preview checkout remains testable on the active preview environment origin.
- Redirect URL validation must accept genuine Mercado Pago hosts and reject lookalike hosts.
- Next.js must be updated from `16.2.6` to the officially patched `16.3.3` release; no unrelated dependency modernization.

---

## File Structure

- Create `supabase/migrations/202608280003_atomic_payment_events.sql` — payment uniqueness and atomic transition RPC.
- Modify `lib/server/orders.ts` — RPC client.
- Modify `lib/server/payment-status.ts` — retain pure transition model as executable specification/tests.
- Modify `app/api/mercadopago/webhook/route.ts` — signature-first, total-aware atomic flow.
- Modify `lib/server/mercadopago.ts` — strict payment ID/response validation if needed.
- Modify `lib/server/env.ts` — production/preview origin rules.
- Modify `lib/server/checkout-url.ts` — Mercado Pago checkout URL allowlist validator.
- Modify `app/api/checkout/route.ts` — use new URL validator and strict origin behavior.
- Modify `components/cart-panel.tsx` — use same client-safe host check semantics.
- Modify `next.config.mjs` — security headers/CSP.
- Modify `package.json`, `pnpm-lock.yaml` — Next.js 16.3.3 security patch.
- Modify/add tests: `tests/payment-status.test.ts`, `tests/payment-rpc-contract.test.ts`, `tests/webhook-signature.test.ts`, `tests/webhook-route.test.ts`, `tests/checkout-origin.test.ts`, `tests/mercadopago-checkout-url.test.ts`, `tests/security-headers.test.ts`.

### Task 1: Add atomic Mercado Pago payment transition RPC

**Files:**
- Create: `supabase/migrations/202608280003_atomic_payment_events.sql`
- Test: `tests/payment-rpc-contract.test.ts`

**Interfaces:**

Create RPC:

```sql
public.apply_mercadopago_payment_event(
  p_order_number text,
  p_payment_id text,
  p_incoming_status text,
  p_status_detail text,
  p_paid_cents integer,
  p_currency_id text
) returns jsonb
```

Return shape:

```json
{
  "outcome": "updated|ignored|manual_review|not_found",
  "order_number": "PB-...",
  "payment_status": "approved",
  "payment_id": "...",
  "expected_cents": 13832,
  "received_cents": 13832
}
```

- [ ] **Step 1: Add a migration contract test fixture**

`tests/payment-rpc-contract.test.ts` reads the SQL file as text and asserts the presence of:

- `for update` row locking;
- `security definer` and `set search_path = ''`;
- service-role-only grants;
- fallback `coalesce(total_cents, subtotal_cents)`;
- explicit handling for `approved`, `refunded`, `charged_back`, `manual_review`;
- unique partial index for `payment_id`.

This is not a substitute for Supabase integration testing; it prevents accidental removal of critical SQL invariants from the migration.

- [ ] **Step 2: Run and verify RED**

Run: `node --experimental-strip-types --test tests/payment-rpc-contract.test.ts`

Expected: FAIL because migration does not exist.

- [ ] **Step 3: Implement row-locking transition logic**

The function must:

1. `select ... into ... from public.orders where order_number = p_order_number for update`;
2. return `not_found` if missing;
3. compute `expected_cents := coalesce(total_cents, subtotal_cents)`;
4. compute `amount_matches := p_paid_cents = expected_cents and p_currency_id = 'BRL'`;
5. for current `approved`: ignore if payment ID differs; allow same-ID `approved`, `refunded`, `charged_back`; ignore other incoming statuses;
6. for current `refunded|charged_back`: ignore different payment ID and ignore non-reversal incoming status;
7. if incoming `approved` and amount/currency mismatch, update to `manual_review`, `payment_status_detail='amount_or_currency_mismatch'`, and bind the incoming payment ID;
8. otherwise update to incoming status/detail/payment ID;
9. return JSON describing the applied/ignored outcome.

Add:

```sql
create unique index if not exists orders_payment_id_uidx
  on public.orders (payment_id)
  where payment_id is not null;
```

Before creating the index in a real environment, query duplicates; if duplicates exist in test data, clean/resolve test rows explicitly rather than silently dropping uniqueness.

- [ ] **Step 4: Lock permissions**

Use:

```sql
revoke all on function public.apply_mercadopago_payment_event(text,text,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.apply_mercadopago_payment_event(text,text,text,text,integer,text) to service_role;
```

- [ ] **Step 5: Apply migration and test real concurrency**

In the Supabase development project, submit two concurrent calls for the same order/payment and verify only valid final state survives. Also test an approved order receiving a different payment ID; it must remain unchanged.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202608280003_atomic_payment_events.sql tests/payment-rpc-contract.test.ts
git commit -m "fix: apply payment events atomically"
```

### Task 2: Add Supabase RPC client and preserve pure transition tests

**Files:**
- Modify: `lib/server/orders.ts`
- Modify: `tests/payment-status.test.ts`
- Create: `tests/orders-payment-rpc.test.ts`

**Interfaces:**

```ts
export interface PaymentEventResult {
  outcome: "updated" | "ignored" | "manual_review" | "not_found"
  order_number: string | null
  payment_status: string | null
  payment_id: string | null
  expected_cents: number | null
  received_cents: number
}

export async function applyMercadoPagoPaymentEvent(input: {
  orderNumber: string
  paymentId: string
  incomingStatus: string
  statusDetail: string | null
  paidCents: number
  currencyId: string
}): Promise<PaymentEventResult>
```

- [ ] **Step 1: Write failing RPC client test**

Mock `fetch` and assert request path:

```text
/rest/v1/rpc/apply_mercadopago_payment_event
```

and exact normalized body keys matching SQL argument names.

- [ ] **Step 2: Run RED**

Run: `node --experimental-strip-types --test tests/orders-payment-rpc.test.ts`

- [ ] **Step 3: Implement RPC call**

Reuse the existing server-only Supabase request helper. Parse exactly one JSON object; reject malformed/non-object results.

Keep `derivePaymentUpdate` and its unit tests as a human-readable executable model. Add tests ensuring its outcomes mirror SQL rules for approved, reversal, mismatch, and same-ID duplicate cases.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test && pnpm typecheck
git add lib/server/orders.ts tests/orders-payment-rpc.test.ts tests/payment-status.test.ts
git commit -m "feat: call atomic payment transition RPC"
```

### Task 3: Harden Mercado Pago payment retrieval and webhook input

**Files:**
- Modify: `lib/server/mercadopago.ts`
- Modify: `app/api/mercadopago/webhook/route.ts`
- Create: `tests/webhook-route.test.ts`

**Interfaces:**

Add helper:

```ts
export function parseMercadoPagoPaymentId(value: string | null): string | null
```

Rules: only `/^\d{1,32}$/`.

- [ ] **Step 1: Write failing route tests**

Cover:

- missing/invalid signature -> 401 before `request.json()`/provider fetch;
- invalid/overlong/non-numeric `data.id` -> 200 for irrelevant event or 400/401 according to route contract, but never provider fetch;
- valid HMAC + non-payment topic -> 200, no provider call;
- valid payment -> fetch provider once and call atomic RPC once;
- invalid order reference -> 200, no database mutation;
- RPC `manual_review` logs only IDs/order/amount numbers, no secrets/customer address;
- RPC `not_found` -> 200 warning;
- provider/RPC temporary failure -> 500 so Mercado Pago can retry.

- [ ] **Step 2: Run RED**

Run: `node --experimental-strip-types --test tests/webhook-route.test.ts`

- [ ] **Step 3: Reorder webhook processing**

Exact flow:

1. read `data.id`, `x-signature`, `x-request-id` from query/headers;
2. load Mercado Pago server env;
3. validate HMAC immediately;
4. return 401 when invalid;
5. determine topic from query `type`; only after valid HMAC may a small bounded JSON body be parsed as fallback for topic;
6. ignore non-payment topics with 200;
7. validate numeric payment ID length/format;
8. fetch authoritative payment from Mercado Pago;
9. validate external reference `/^PB-[A-F0-9]{12}$/`;
10. convert transaction amount to integer cents safely and reject invalid/non-finite values;
11. call `applyMercadoPagoPaymentEvent` with provider status/detail/currency/paid cents;
12. return 200 for updated/ignored/manual-review/not-found outcomes.

Remove webhook's read-then-`updateOrderByNumber` transition path.

- [ ] **Step 4: Run all payment/webhook tests**

Run: `pnpm test && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/mercadopago.ts app/api/mercadopago/webhook/route.ts tests/webhook-route.test.ts
git commit -m "fix: harden Mercado Pago webhook processing"
```

### Task 4: Lock Production checkout origin while preserving Preview

**Files:**
- Modify: `lib/server/env.ts`
- Modify: `tests/checkout-origin.test.ts`
- Modify: `app/api/checkout/route.ts`

**Interfaces:**

Use an explicit environment input internally:

```ts
export function isAllowedCheckoutOrigin(input: {
  originHeader: string | null
  configuredSiteUrl: string
  requestOrigin: string
  nodeEnv: string | undefined
  previous hosting providerEnv: string | undefined
}): boolean
```

- [ ] **Step 1: Write failing policy tests**

Production (`HOSTING_ENV=production`):

- exact configured HTTPS origin -> true;
- missing Origin -> false;
- request preview origin different from configured domain -> false;
- arbitrary HTTPS origin -> false.

Preview/development:

- exact request origin -> true;
- configured site origin -> true;
- arbitrary third-party origin -> false;
- malformed Origin -> false.

Also change `resolvePublicSiteUrl` so production throws when `NEXT_PUBLIC_SITE_URL` is absent instead of falling back to request origin.

- [ ] **Step 2: Run RED**

Run: `node --experimental-strip-types --test tests/checkout-origin.test.ts`

- [ ] **Step 3: Implement strict policy and wire checkout route**

Production must also require configured site URL protocol `https:`.

Do not infer Production solely from host names; use environment state plus configured URL.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test && pnpm typecheck
git add lib/server/env.ts tests/checkout-origin.test.ts app/api/checkout/route.ts
git commit -m "fix: restrict production checkout origins"
```

### Task 5: Validate Mercado Pago checkout redirect hosts server and client side

**Files:**
- Modify: `lib/server/checkout-url.ts`
- Modify: `tests/mercadopago-checkout-url.test.ts`
- Modify: `components/cart-panel.tsx`
- Modify: `app/api/checkout/route.ts`

**Interfaces:**

```ts
export function isAllowedMercadoPagoCheckoutUrl(value: string): boolean
```

Allowed hostname suffixes for the Brazil Checkout Pro integration:

```text
mercadopago.com
mercadopago.com.br
```

Accept exact domain or dot-delimited subdomain only. Reject `mercadopago.com.evil.test`, `evilmercadopago.com`, credentials-in-URL tricks, non-HTTPS, non-default dangerous schemes, malformed URL.

- [ ] **Step 1: Write failing host-validation tests**

Include genuine examples already represented in tests:

```text
https://www.mercadopago.com/checkout/v1/redirect?pref_id=prod
https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=test
```

Add malicious lookalikes and HTTP examples.

- [ ] **Step 2: Run RED**

Run: `node --experimental-strip-types --test tests/mercadopago-checkout-url.test.ts`

- [ ] **Step 3: Implement validator**

Server validates before returning `checkoutUrl`. Client validates again before `window.location.assign`; client validation is defense-in-depth and does not replace server validation.

- [ ] **Step 4: Run tests/typecheck and commit**

```bash
pnpm test && pnpm typecheck
git add lib/server/checkout-url.ts tests/mercadopago-checkout-url.test.ts components/cart-panel.tsx app/api/checkout/route.ts
git commit -m "fix: validate Mercado Pago checkout redirects"
```

### Task 6: Add HTTP security headers and tested CSP

**Files:**
- Modify: `next.config.mjs`
- Create: `tests/security-headers.test.ts`

**Interfaces:**

Production headers for all routes:

```text
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

CSP baseline:

```text
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
img-src 'self' data: https:;
font-src 'self' data:;
style-src 'self' 'unsafe-inline';
script-src 'self' 'unsafe-inline' https://legacy analytics script endpoint;
connect-src 'self' https://legacy analytics telemetry endpoint;
upgrade-insecure-requests
```

- [ ] **Step 1: Write failing config test**

Import/read the config and assert required headers exist, no wildcard `*` appears in `script-src`, no `unsafe-eval` appears, and HSTS is production-only.

- [ ] **Step 2: Run RED**

Run: `node --experimental-strip-types --test tests/security-headers.test.ts`

- [ ] **Step 3: Implement headers**

Use Next.js `headers()` configuration. For non-production environments, omit HSTS and `upgrade-insecure-requests`; keep the remaining defensive headers where they do not block Preview.

- [ ] **Step 4: Build and smoke-test pages**

Run `pnpm build`, then check Home, products, cart, `/pedido/<test-token>` and legacy analytics integration behavior in Preview browser/devtools. If Analytics needs an additional documented origin, add only that exact origin and add it to the test fixture.

- [ ] **Step 5: Commit**

```bash
git add next.config.mjs tests/security-headers.test.ts
git commit -m "feat: add production security headers"
```

### Task 7: Upgrade Next.js to the patched 16.3.3 release

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Exact Next.js version: `16.3.3`.

- [ ] **Step 1: Confirm official advisory immediately before upgrade**

Verify Next.js official security release still identifies `16.3.3` as the Active LTS patched release for the August 2026 critical vulnerabilities. Do not substitute an older release.

- [ ] **Step 2: Update dependency**

Run:

```bash
pnpm add next@16.3.3
```

Do not intentionally bump unrelated packages.

- [ ] **Step 3: Verify lockfile diff**

Confirm `package.json` is `"next": "16.3.3"` and lockfile resolves that version. Review transitive changes generated by pnpm.

- [ ] **Step 4: Run full verification**

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: update Next.js security patch"
```

## Plan 3 Completion Gate

Before customer-facing cleanup/rollout:

- atomic payment RPC has been applied in Supabase development environment;
- concurrent webhook test cannot corrupt approved/reversal state;
- webhook checks stored final total including freight;
- HMAC verification happens before optional webhook JSON parsing/provider work;
- invalid payment IDs never reach Mercado Pago;
- production checkout rejects Preview/arbitrary/no-Origin requests;
- Preview still accepts its own valid origin;
- only allowed HTTPS Mercado Pago hosts can be returned/navigated;
- security headers do not break checkout or Analytics;
- Next.js resolves to 16.3.3;
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass.
