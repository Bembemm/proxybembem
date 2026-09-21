# Customer Account Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the customer account lifecycle with cancellation support, stronger password changes, confirmation resend, email change, privacy request, and saved addresses without changing payment/shipping authority.

**Architecture:** Keep account mutations in same-origin Next.js route handlers and use Supabase Auth as the identity authority. Add one RLS-protected `customer_addresses` table for reusable addresses while continuing to snapshot the final address into each order at checkout. High-risk deletion remains a support request rather than an immediate destructive operation.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, Supabase Auth/Postgres/RLS, Tailwind CSS 4, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-18-customer-account-completeness-design.md`

## Global Constraints

- Work only on `feat/customer-account-completeness`.
- Do not apply a production database migration during branch implementation.
- Do not change Mercado Pago payment/refund semantics.
- Do not automatically cancel orders, refund payments, cancel Melhor Envio labels, or delete financial/order history.
- Historical order email/address snapshots never change when account data changes.
- All account mutations are same-origin, body-bounded, rate-limited, authenticated where applicable, and no-store.
- Saved-address access is owner-scoped by RLS.
- Passwords, auth codes, tokens, session cookies, and full confirmation URLs are never logged.

---

### Task 1: Customer cancellation request

**Files:**
- Modify: `app/minha-conta/pedidos/[id]/page.tsx`
- Test: `tests/customer-order-actions.test.ts`

**Interfaces:**
- Consumes: existing `buildWhatsAppOrderUrl(number, message)`.
- Produces: customer-facing `Solicitar cancelamento` WhatsApp action for operationally eligible orders.

- [ ] **Step 1: Write failing test**

Create a source-contract test that asserts the order detail builds a cancellation WhatsApp URL containing `order.orderNumber`, renders `Solicitar cancelamento`, and hides it for `shipped`, `completed`, and `canceled`.

- [ ] **Step 2: Run test and verify RED**

Run:
`node --experimental-strip-types --test tests/customer-order-actions.test.ts`

Expected: fail because cancellation action is absent.

- [ ] **Step 3: Implement minimal UI**

Add:
`const canRequestCancellation = !["shipped", "completed", "canceled"].includes(order.fulfillmentStatus)`

Build the URL through `buildWhatsAppOrderUrl` with:
`Olá! Gostaria de solicitar o cancelamento do pedido ${order.orderNumber}. Poderia me orientar sobre os próximos passos?`

Render a secondary red/rose outlined action only when eligible. Do not call any cancellation API.

- [ ] **Step 4: Run test and verify GREEN**
- [ ] **Step 5: Commit `feat: add customer cancellation request action`**

---

### Task 2: Strong authenticated password change

**Files:**
- Modify: `lib/server/customer-account-actions.ts`
- Modify: `app/api/account/password/route.ts`
- Modify: `components/account/password-form.tsx`
- Test: `tests/customer-password-change.test.ts`

**Interfaces:**
- Normal password route accepts `{ currentPassword, password }`.
- Recovery route continues to accept `{ password }`.
- Supabase Auth update call uses `{ password, current_password: currentPassword }`.

- [ ] **Step 1: Write failing parser/route/UI tests**

Assert:
- normal password parser rejects missing `currentPassword`;
- current password accepts 8..128 characters without imposing new-password complexity on the old credential;
- new password keeps current strong policy;
- recovery parser/route is unchanged;
- UI contains a `Senha atual` field only in non-recovery mode.

- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Implement parser split and route update**
- [ ] **Step 4: Update `PasswordForm` to collect/send current password in normal mode**
- [ ] **Step 5: Verify GREEN**
- [ ] **Step 6: Commit `feat: require current password for password changes`**

---

### Task 3: Signup confirmation resend

**Files:**
- Modify: `lib/server/rate-limit.ts`
- Create: `app/api/account/confirmation-resend/route.ts`
- Create: `components/account/confirmation-resend-form.tsx`
- Modify: `app/cadastro-recebido/page.tsx`
- Test: `tests/customer-confirmation-resend.test.ts`

**Interfaces:**
- POST body: `{ email: string }`.
- Always returns neutral success text for syntactically valid input.
- Uses `auth.resend({ type: "signup", email, options: { emailRedirectTo } })`.

- [ ] **Step 1: Write failing tests for origin check, body bound, email parsing, rate-limit scope, neutral response, and UI**
- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Add `account-confirmation-resend` rate-limit scope**
- [ ] **Step 4: Implement resend route using existing public-site URL resolver and confirmation callback**
- [ ] **Step 5: Add resend form to `/cadastro-recebido`**
- [ ] **Step 6: Verify GREEN**
- [ ] **Step 7: Commit `feat: add signup confirmation resend`**

---

### Task 4: Email change and privacy request

**Files:**
- Modify: `lib/server/customer-account-actions.ts`
- Modify: `lib/server/rate-limit.ts`
- Create: `app/api/account/email/route.ts`
- Create: `components/account/email-change-form.tsx`
- Create: `components/account/privacy-request-card.tsx`
- Modify: `app/minha-conta/seguranca/page.tsx`
- Test: `tests/customer-security-settings.test.ts`

**Interfaces:**
- Email-change POST: `{ email, currentPassword }`.
- Authenticated user identity comes from server session only.
- Current password is verified with an isolated non-persisted Supabase Auth client using the trusted current email.
- After verification, current authenticated server client calls `auth.updateUser({ email })`.
- Privacy card only opens WhatsApp; it never deletes data.

- [ ] **Step 1: Write failing tests for parser, current-password requirement, owner session requirement, no order mutation, privacy copy/action, and UI**
- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Add email-change parser and rate-limit scope**
- [ ] **Step 4: Implement email-change route with isolated password verification**
- [ ] **Step 5: Implement email form and privacy request card on Security page**
- [ ] **Step 6: Verify GREEN**
- [ ] **Step 7: Commit `feat: add customer email and privacy controls`**

---

### Task 5: Saved addresses data model and account CRUD

**Files:**
- Create: one Supabase migration generated for `customer_addresses`
- Create: `lib/server/customer-addresses.ts`
- Create: `app/api/account/addresses/route.ts`
- Create: `app/api/account/addresses/[id]/route.ts`
- Create: `components/account/address-book.tsx`
- Create: `app/minha-conta/enderecos/page.tsx`
- Modify: `components/account/account-nav.tsx`
- Modify: `lib/server/rate-limit.ts`
- Test: `tests/customer-addresses.test.ts`
- Test: `tests/customer-address-migration.test.ts`
- Test: `tests/customer-account-ui.test.ts`

**Interfaces:**
- `CustomerAddressInput = { label, cep, street, number, complement, neighborhood, city, state, isDefault }`.
- Maximum 5 addresses per customer.
- CRUD is authenticated and owner-scoped.
- Default uniqueness is enforced in Postgres and normalized server-side.

- [ ] **Step 1: Generate migration filename with Supabase CLI, then write failing migration/source tests**
- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Add table, constraints, timestamps, partial unique default index, explicit grants, RLS policies**
- [ ] **Step 4: Implement address normalization/storage module**
- [ ] **Step 5: Implement same-origin rate-limited CRUD routes**
- [ ] **Step 6: Implement account Address Book page and navigation**
- [ ] **Step 7: Verify focused tests GREEN**
- [ ] **Step 8: Commit `feat: add customer saved addresses`**

---

### Task 6: Saved addresses in checkout

**Files:**
- Modify: `components/checkout-page.tsx`
- Modify: `components/checkout-form.tsx`
- Create or modify a focused checkout address selector component as needed
- Test: `tests/checkout-saved-addresses.test.ts`

**Interfaces:**
- Checkout uses saved-address rows only as a UI convenience.
- Final checkout request still sends the fully expanded address fields.
- Existing sessionStorage login draft takes precedence over any saved default address.
- If there is no preserved draft and a default address exists, prefill it once.
- Selecting a saved address updates the existing checkout state and forces shipping quote refresh through existing field-change behavior.

- [ ] **Step 1: Write failing tests for default prefill, draft precedence, address selection, and expanded checkout payload**
- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Add authenticated address read path needed by checkout**
- [ ] **Step 4: Add saved-address selector without changing checkout authority**
- [ ] **Step 5: Verify GREEN**
- [ ] **Step 6: Commit `feat: use saved addresses during checkout`**

---

### Task 7: Full verification and branch review

**Files:**
- Modify tests only if a verified regression requires correction; do not weaken assertions.

- [ ] **Step 1: Run focused new tests**
- [ ] **Step 2: Run `pnpm lint`**
- [ ] **Step 3: Run `pnpm typecheck`**
- [ ] **Step 4: Run `pnpm test`**
- [ ] **Step 5: Run `pnpm build`**
- [ ] **Step 6: Inspect branch diff against `main` for auth, RLS, destructive behavior, payment/shipping regressions**
- [ ] **Step 7: Open PR against `main` and require GitHub CI to finish successfully before recommending merge**
