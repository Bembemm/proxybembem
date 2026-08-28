# Customer-Facing Checkout Cleanup, Policies, Documentation, and Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the direct-checkout experience by showing complete paid-order/shipping details, removing stale Pix/freight copy, adding clear privacy/terms/refund pages, documenting setup, and proving the whole flow in Preview/Sandbox before Production.

**Architecture:** Customer-facing pages render only trusted order data from Supabase and describe the actual Mercado Pago + Melhor Envio flow. Policy pages avoid exposing private seller secrets/CPF/home address and avoid unsupported claims of legal compliance. Rollout is a checklist-driven environment promotion: CI first, then Preview/Sandbox end-to-end, then clean Production credentials/configuration, with no automatic merge to `main`.

**Tech Stack:** Next.js App Router/React, existing site components, Supabase order data, Mercado Pago Checkout Pro, Melhor Envio Sandbox/Production, Vercel Preview/Production, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-28-shipping-checkout-security-design.md`

## Global Constraints

- Execute after the shipping/checkout/security plans are complete and green.
- All work stays on `feat/checkout-mercadopago`; do not merge `main` without explicit user approval.
- Payment truth is database-backed.
- Freight is selected and charged before Mercado Pago payment.
- Label purchase remains manual in Melhor Envio after payment approval.
- Do not claim proxies are official Magic: The Gathering products or permitted in sanctioned tournaments.
- Do not put seller CPF, private home address, API tokens, Client Secret, webhook secrets, or service-role keys into source code or public pages.
- Privacy/terms/refund copy is informational storefront text, not a claim that legal review has occurred.
- Customer address/contact must not be sent to analytics payloads or public query strings.
- Production is not enabled until a full Preview/Sandbox purchase passes.

---

## File Structure

- Modify `app/pedido/[token]/page.tsx` — pass full trusted order/shipping data to status UI.
- Modify `components/order-status.tsx` — render subtotal/freight/total/service/address/status.
- Modify `components/footer.tsx` — accurate Checkout Pro/security copy and policy links.
- Modify `data/products.ts` — remove stale post-purchase/freight language if still present.
- Create `app/privacidade/page.tsx` — privacy notice.
- Create `app/termos/page.tsx` — terms/store/product notice.
- Create `app/trocas-e-reembolsos/page.tsx` — exchange/refund policy.
- Modify `docs/payments-setup.md` — current Mercado Pago behavior.
- Create `docs/shipping-setup.md` — Melhor Envio configuration and manual-label workflow.
- Modify `.env.example` — complete variable name list, no values/secrets.
- Modify `README.md` if it exists and currently documents checkout setup; otherwise do not create a duplicate setup guide.
- Add `tests/order-display.test.ts` and `tests/policy-copy.test.ts` for pure format/copy invariants where useful.

### Task 1: Render complete trusted order and shipping details

**Files:**
- Modify: `app/pedido/[token]/page.tsx`
- Modify: `components/order-status.tsx`
- Create: `lib/order-display.ts`
- Create: `tests/order-display.test.ts`

**Interfaces:**

```ts
export interface OrderDisplayData {
  orderNumber: string
  paymentStatus: string
  items: Array<{ title: string; quantity: number; unitPriceCents: number }>
  subtotalCents: number
  shippingCents: number | null
  totalCents: number
  carrierName: string | null
  serviceName: string | null
  deliveryDays: number | null
  address: {
    street: string
    number: string
    complement: string | null
    neighborhood: string
    city: string
    state: string
    cep: string
  } | null
}

export function toOrderDisplayData(order: OrderRecord): OrderDisplayData
```

Legacy order fallback:

```ts
totalCents = order.total_cents ?? order.subtotal_cents
shippingCents = order.shipping_cents
address = null when any required new address field is null
```

- [ ] **Step 1: Write failing display-mapping tests**

Cover a new paid order with freight/address and a legacy order without new fields. Assert integer-cent totals are not recomputed from client/display floats.

- [ ] **Step 2: Run RED**

Run: `node --experimental-strip-types --test tests/order-display.test.ts`

- [ ] **Step 3: Implement mapping and UI**

Approved order UI must show, when available:

```text
Pedido PB-XXXXXXXXXXXX
Pagamento aprovado
Produtos
Subtotal dos produtos
Frete
Total pago
Entrega: <transportadora> — <serviço>
Prazo estimado: <N> dias úteis
Endereço de entrega
```

Do not show `public_token`, provider access tokens, raw `shipping_snapshot`, webhook details, checkout URL, checkout fingerprint, or internal IDs.

Keep current approved-state cart clearing behavior.

- [ ] **Step 4: Verify payment-status states**

Check pending, approved, rejected/cancelled, refunded, charged_back, manual_review and checkout_error render coherent customer messages. `manual_review` must not claim approval.

- [ ] **Step 5: Run tests/typecheck/build and commit**

```bash
pnpm test && pnpm typecheck && pnpm build
git add app/pedido/[token]/page.tsx components/order-status.tsx lib/order-display.ts tests/order-display.test.ts
git commit -m "feat: show shipping details on order page"
```

### Task 2: Remove stale checkout/freight/Pix copy site-wide

**Files:**
- Modify: `components/footer.tsx`
- Modify: `components/checkout-form.tsx`
- Modify: `components/order-summary.tsx`
- Modify: `lib/checkout.ts`
- Modify: `data/products.ts`
- Create: `tests/policy-copy.test.ts`

- [ ] **Step 1: Add a stale-copy regression test**

Read the relevant source files and assert they do not contain these obsolete customer-facing phrases:

```text
Pagamento via Pix combinado no atendimento
O frete não está incluído no subtotal e será calculado no atendimento
frete: A calcular
```

- [ ] **Step 2: Run RED**

Run: `node --experimental-strip-types --test tests/policy-copy.test.ts`

Expected: FAIL on current stale copy.

- [ ] **Step 3: Replace copy with actual flow**

Footer security/payment line:

```text
Pagamento processado pelo Mercado Pago. Dados bancários e do cartão não são armazenados pela ProxyBembem.
```

Checkout help text:

```text
Informe seu endereço para consultar as opções e o valor do frete antes do pagamento.
```

Product/list communication may continue through WhatsApp, but it must not imply that freight/payment is negotiated there after direct checkout.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test && pnpm typecheck
git add components/footer.tsx components/checkout-form.tsx components/order-summary.tsx lib/checkout.ts data/products.ts tests/policy-copy.test.ts
git commit -m "fix: update storefront payment and freight copy"
```

### Task 3: Add Privacy page

**Files:**
- Create: `app/privacidade/page.tsx`
- Modify: `components/footer.tsx`

- [ ] **Step 1: Create page with explicit sections**

The page must state in plain Portuguese:

1. data collected for an order: name, WhatsApp, delivery address, cart/order and payment-status identifiers;
2. purposes: create/fulfill the order, calculate freight, communicate about production/delivery, handle payment status/support;
3. Mercado Pago handles payment processing and ProxyBembem does not receive/store full card credentials;
4. Melhor Envio receives shipping data necessary for quotation/fulfillment workflows;
5. Vercel Analytics may receive technical/usage information but order address/contact is not intentionally placed in analytics events;
6. server/order records are protected from anonymous direct database access by the application's backend controls;
7. customers can contact `contato@proxybembem.com.br` to ask questions about their order/data;
8. no statement should claim certification, external audit, or guaranteed absolute security.

Use a visible "Última atualização: 28/08/2026" line.

- [ ] **Step 2: Add footer link**

Add internal link `/privacidade` with accessible text `Privacidade`.

- [ ] **Step 3: Build and visually inspect mobile/desktop**

Run: `pnpm build` and check typography/spacing against existing site style.

- [ ] **Step 4: Commit**

```bash
git add app/privacidade/page.tsx components/footer.tsx
git commit -m "feat: add privacy notice"
```

### Task 4: Add Terms page with proxy/product and checkout rules

**Files:**
- Create: `app/termos/page.tsx`
- Modify: `components/footer.tsx`

- [ ] **Step 1: Create terms with explicit storefront rules**

Sections must cover:

- ProxyBembem sells non-official proxy cards intended for casual play, testing and collection/custom use; they are not original Wizards of the Coast products.
- Proxies are not represented as legal for sanctioned tournaments.
- Product images/descriptions and customer-supplied deck/list information define customization/production requirements.
- Prices shown in checkout use the site's current product price plus the selected freight quoted before payment.
- Payment is processed by Mercado Pago; an order is treated as paid only after the backend receives/validates provider payment status.
- Freight price/service comes from Melhor Envio availability for origin/destination/package information; estimated delivery time is an estimate, not a guaranteed delivery date.
- The customer is responsible for checking delivery address information before paying.
- Production/shipping/support communication may occur through the provided WhatsApp/email.
- Nothing on the page removes statutory consumer rights; the separate exchange/refund page explains the store process.

Do not include claims about trademark ownership beyond a simple non-affiliation notice. Do not invent a CNPJ or CPF.

- [ ] **Step 2: Add footer link `Termos`**

Link to `/termos`.

- [ ] **Step 3: Build/inspect and commit**

```bash
pnpm typecheck && pnpm build
git add app/termos/page.tsx components/footer.tsx
git commit -m "feat: add storefront terms"
```

### Task 5: Add Exchanges and Refunds page

**Files:**
- Create: `app/trocas-e-reembolsos/page.tsx`
- Modify: `components/footer.tsx`

- [ ] **Step 1: Create process-focused policy**

The page must tell customers to contact `contato@proxybembem.com.br` or the published WhatsApp with order number and explanation/photos when relevant.

Cover these distinct cases without inventing legal deadlines beyond applicable law:

- item arrived damaged/with production defect;
- item/order differs materially from what was agreed;
- address or customer-list/customization error reported before production/shipment;
- cancellation/withdrawal requests;
- refund processing after approval through the applicable payment method/provider;
- shipping carrier delay/loss handled through support and carrier/provider investigation.

State:

```text
Esta política descreve o procedimento de atendimento da loja e não limita direitos previstos na legislação aplicável.
```

Because made-to-order/customized products can have fact-specific cancellation rules, do not publish a blanket "sem devolução" or "não reembolsável" rule without separate legal review.

- [ ] **Step 2: Add footer link `Trocas e reembolsos`**

Link to `/trocas-e-reembolsos`.

- [ ] **Step 3: Build/inspect and commit**

```bash
pnpm typecheck && pnpm build
git add app/trocas-e-reembolsos/page.tsx components/footer.tsx
git commit -m "feat: add exchange and refund policy"
```

### Task 6: Update Mercado Pago and Melhor Envio setup docs

**Files:**
- Modify: `docs/payments-setup.md`
- Create: `docs/shipping-setup.md`
- Modify: `.env.example`

- [ ] **Step 1: Correct Mercado Pago documentation**

Remove any instruction that says Sandbox must use `sandbox_init_point`. Document the implemented rule: Checkout Pro uses the returned `init_point`; test mode is determined by the active test/seller credentials/environment used by the integration.

Document webhook endpoint:

```text
/api/mercadopago/webhook
```

Document that Production uses the canonical site URL and Production webhook secret/credentials, while Preview uses test credentials.

- [ ] **Step 2: Write `docs/shipping-setup.md`**

Document exact provider behavior:

- quote endpoint used by the app: `/api/v2/me/shipment/calculate`;
- Sandbox base `https://sandbox.melhorenvio.com.br`;
- Production base `https://melhorenvio.com.br`;
- required bearer token and `User-Agent` remain server-side;
- product quote mode sends weight kg, dimensions cm, insurance value BRL and quantity;
- use `custom_price` and `custom_delivery_time`;
- Sandbox transport availability may be limited;
- origin CEP comes from `SHIPPING_ORIGIN_CEP`;
- current deck package data is provisional and must be replaced after a packed order is weighed/measured;
- site quotes/charges freight only; seller buys/prints label manually in Melhor Envio after payment approval;
- Production uses clean Production Melhor Envio credentials, not Sandbox credentials.

- [ ] **Step 3: Finalize `.env.example` names**

Include names only/placeholders for:

```text
MERCADO_PAGO_ENVIRONMENT
MERCADO_PAGO_ACCESS_TOKEN
MERCADO_PAGO_WEBHOOK_SECRET
SUPABASE_URL
SUPABASE_SECRET_KEY
NEXT_PUBLIC_SITE_URL
MELHOR_ENVIO_ENVIRONMENT
MELHOR_ENVIO_ACCESS_TOKEN
MELHOR_ENVIO_USER_AGENT
SHIPPING_ORIGIN_CEP
SHIPPING_QUOTE_SECRET
RATE_LIMIT_SECRET
```

No real access token, webhook secret, Supabase key, Melhor Envio secret/token, or generated HMAC secret appears in docs/example.

- [ ] **Step 4: Commit**

```bash
git add docs/payments-setup.md docs/shipping-setup.md .env.example
git commit -m "docs: document payment and shipping setup"
```

### Task 7: Run static secret/copy review

**Files:**
- Repository-wide review only; modify only files that fail checks.

- [ ] **Step 1: Search tracked source for credential patterns**

Check for accidental real values around names such as:

```text
MERCADO_PAGO_ACCESS_TOKEN
MERCADO_PAGO_WEBHOOK_SECRET
SUPABASE_SECRET_KEY
MELHOR_ENVIO_ACCESS_TOKEN
client_secret
Authorization: Bearer
```

Expected: only variable names, code that reads them, or redacted documentation examples. Never print real environment values as part of this check.

- [ ] **Step 2: Search for stale copy**

Search repository for phrases implying freight is calculated later/by WhatsApp or payment is only Pix. Fix every customer-facing occurrence that contradicts the implemented checkout.

- [ ] **Step 3: Run full project verification**

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all PASS.

- [ ] **Step 4: Commit only if review required fixes**

Use a focused commit message describing the actual cleanup; do not create an empty commit.

### Task 8: Verify GitHub Actions at final branch head

**Files:**
- No source change unless CI reveals an issue.

- [ ] **Step 1: Push/finalize current feature branch head**

Ensure all plan commits are on `feat/checkout-mercadopago`.

- [ ] **Step 2: Check GitHub Actions run for that exact head SHA**

Required jobs: dependency install with frozen lockfile, tests, typecheck, build.

- [ ] **Step 3: If CI fails, fix through normal TDD/debugging path**

Do not declare readiness from local tests alone.

### Task 9: Configure Preview environment without sharing secrets in chat

**Files:**
- Vercel Preview environment settings; no source change.

- [ ] **Step 1: Set Preview variables**

Configure test/Sandbox values for all required environment names. The user enters secret values directly in Vercel; they are never pasted into chat, screenshots, git, or docs.

Use:

```text
NEXT_PUBLIC_SITE_URL=<active Preview URL or configuration supported by the tested Preview-origin logic>
MERCADO_PAGO_ENVIRONMENT=sandbox
MELHOR_ENVIO_ENVIRONMENT=sandbox
SHIPPING_ORIGIN_CEP=86730000
MELHOR_ENVIO_USER_AGENT=ProxyBembem (contato@proxybembem.com.br)
```

Generate `SHIPPING_QUOTE_SECRET` and `RATE_LIMIT_SECRET` as independent random 32+ byte secrets.

- [ ] **Step 2: Redeploy Preview**

Verify provider callbacks/webhooks that need public access are not blocked by Preview Deployment Protection during the test window.

### Task 10: Perform full Preview/Sandbox end-to-end acceptance test

**Files:**
- No code change unless a test reveals a bug.

- [ ] **Step 1: Test quote UX**

Use a valid destination CEP and verify available Melhor Envio services display carrier/service, `custom_price`, ETA, and no invalid services.

- [ ] **Step 2: Test multiple quantity/product behavior**

At minimum test current deck quantity 1 and quantity 2. If another product exists by execution time, include a mixed cart; otherwise unit tests cover multi-product logic until a second real product is added.

- [ ] **Step 3: Test tamper/change behavior**

Confirm changing cart/CEP clears selected freight. Confirm a stale/modified quote token cannot create payment. Use a mocked/test-controlled changed quote path to verify 409/reconfirmation UX if live Sandbox price does not naturally change.

- [ ] **Step 4: Complete Mercado Pago test-buyer payment**

Verify Mercado Pago amount exactly equals product subtotal + selected freight.

- [ ] **Step 5: Verify signed webhook and database-backed approval**

Confirm webhook returns 200, `orders.payment_status` becomes approved through atomic RPC, and order page changes because the database changed—not because of return URL query parameters.

- [ ] **Step 6: Verify paid order detail**

Confirm order page shows correct products, subtotal, freight, total, address, carrier/service, ETA and payment status.

- [ ] **Step 7: Verify manual fulfillment information**

Using the paid test order, confirm the saved address/service/package snapshot contains enough information for the seller to manually reproduce/purchase the shipment in Melhor Envio. Do not call label-purchase API.

- [ ] **Step 8: Record acceptance result in PR description/comment**

Record only non-secret identifiers/results, e.g. branch SHA, test order number, provider test payment ID, services/prices observed, CI run status. Never include credentials/signatures.

### Task 11: Prepare Production without merging

**Files:**
- Vercel Production/Mercado Pago/Melhor Envio account settings; no merge.

- [ ] **Step 1: Create/use clean Production Melhor Envio credentials**

Sandbox credentials are not copied to Production. Configure the real account/provider settings and enabled transport services for the seller's origin.

- [ ] **Step 2: Configure real Mercado Pago Production credentials/webhook secret**

Production webhook:

```text
https://www.proxybembem.com.br/api/mercadopago/webhook
```

- [ ] **Step 3: Configure canonical Production site URL**

```text
NEXT_PUBLIC_SITE_URL=https://www.proxybembem.com.br
```

Set Production-only secrets directly in Vercel.

- [ ] **Step 4: Replace provisional package measurements before sustained real sales**

The site can deploy with the provisional value only if the seller deliberately accepts that temporary estimate. As soon as a scale is available, weigh one fully packed 100-card order and update product shipping metadata with measured values, then re-run quote tests/build.

- [ ] **Step 5: Keep PR unmerged pending explicit owner approval**

Do not merge, enable auto-merge, or replace `main` as part of this plan.

## Final Readiness Gate

The feature is ready to be presented for merge approval only when:

- all four implementation plans are complete;
- all migrations are applied/verified in the test environment;
- GitHub Actions is green at the exact final head SHA;
- Preview/Sandbox full purchase succeeds;
- quote amount equals charged freight;
- Mercado Pago charged total equals stored `total_cents`;
- signed webhook updates payment atomically;
- order page displays the trusted shipping/payment snapshot;
- no stale Pix/separate-freight copy remains;
- policy pages and setup docs exist;
- no secrets are committed/exposed;
- Production credentials are clean and server-only;
- `main` has not been merged without explicit approval.
