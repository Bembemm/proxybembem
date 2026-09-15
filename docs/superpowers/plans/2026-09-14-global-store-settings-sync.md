# Global Store Settings Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Phase 7 store settings the single public source of truth everywhere those same contact and production-lead-time values are shown.

**Architecture:** Keep the existing store-settings validation/cache layer intact. Refresh the App Router after a successful admin mutation, convert policy pages to cached settings consumers, and pass the cached global production lead time into product-detail rendering where only the `PRAZO` section is overridden.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Node test runner, Supabase-backed store settings.

**Spec:** `docs/superpowers/specs/2026-09-14-global-store-settings-design.md`

## Global Constraints

- Do not modify or reapply any Supabase migration.
- Do not change current admin setting values.
- Preserve optimistic concurrency and existing validation.
- Keep settings plain-text rendered; no HTML injection.
- Do not convert infrastructure/customer/transactional values into store settings.

---

### Task 1: Regression tests for global settings consumers

**Files:**
- Modify: `tests/public-store-settings-ui.test.ts`

**Interfaces:**
- Consumes: existing source-based public settings UI tests.
- Produces: failing assertions for router refresh, policy contact settings, and product lead-time propagation/override.

- [ ] **Step 1: Write failing tests**

Add assertions that:

```ts
assert.match(adminSettingsForm, /useRouter/)
assert.match(adminSettingsForm, /router\.refresh\(\)/)
assert.match(privacyPage, /getPublicStoreSettings/)
assert.doesNotMatch(privacyPage, /mailto:contato@proxybembem\.com\.br/i)
assert.match(refundsPage, /getPublicStoreSettings/)
assert.doesNotMatch(refundsPage, /mailto:contato@proxybembem\.com\.br/i)
assert.match(homeRoute, /productionLeadTimeBusinessDays/)
assert.match(productsRoute, /productionLeadTimeBusinessDays/)
assert.match(productModal, /productionLeadTimeBusinessDays/)
assert.match(productModal, /section\.title\.trim\(\)\.toUpperCase\(\)\s*===\s*["']PRAZO["']/)
```

- [ ] **Step 2: Run the test to verify RED**

Run the repository CI/test workflow for the isolated branch. Expected: failure because the existing admin form does not refresh the router, policy pages still hard-code the public support email, and the product modal has no global lead-time input.

- [ ] **Step 3: Commit only the failing test**

Commit message:

```text
test: require global store settings consumers
```

### Task 2: Refresh public projection after admin save

**Files:**
- Modify: `components/admin/settings/store-settings-form.tsx`

**Interfaces:**
- Consumes: successful PATCH response and existing `saved` settings parsing.
- Produces: `router.refresh()` after successful durable save only.

- [ ] **Step 1: Implement minimal refresh behavior**

Import `useRouter` from `next/navigation`, create `const router = useRouter()` in `StoreSettingsForm`, and call:

```ts
router.refresh()
```

only after `setDirty(false)`/successful saved-settings handling.

- [ ] **Step 2: Keep failure paths unchanged**

Do not refresh on 400, 409, 503, malformed response, or network failure.

### Task 3: Remove hard-coded public policy contact email

**Files:**
- Modify: `app/privacidade/page.tsx`
- Modify: `app/trocas-e-reembolsos/page.tsx`

**Interfaces:**
- Consumes: `getPublicStoreSettings(): Promise<PublicStoreSettings>`.
- Produces: conditional `mailto:` links sourced from `contactEmail`.

- [ ] **Step 1: Convert both pages to async server pages**

Import `getPublicStoreSettings`, read settings inside each page, and assign `const contactEmail = storeSettings.contactEmail`.

- [ ] **Step 2: Render configured email only when present**

Replace the literal email/link with conditional React using:

```tsx
{contactEmail ? (
  <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
) : (
  <>pelos canais de contato publicados no site</>
)}
```

Adapt surrounding grammar per page without inventing a fallback email.

### Task 4: Make product `PRAZO` obey the global lead time

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/produtos/page.tsx`
- Modify: `components/pages/home-page.tsx`
- Modify: `components/pages/products-page.tsx`
- Modify: `components/product-detail-modal.tsx`

**Interfaces:**
- Consumes: `getPublicStoreSettings().productionLeadTimeBusinessDays`.
- Produces: `productionLeadTimeBusinessDays: number` prop from server route to client page to `ProductDetailModal`.

- [ ] **Step 1: Read the cached setting in both server routes**

Use `getPublicStoreSettings()` and pass only `productionLeadTimeBusinessDays` into the client page component.

- [ ] **Step 2: Thread the number through HomePage and ProductsPage**

Extend component props and pass the number to every `ProductDetailModal` instance.

- [ ] **Step 3: Override only the normalized `PRAZO` section at render time**

In `ProductDetailModal`, compute:

```ts
const productionLeadTime =
  productionLeadTimeBusinessDays === 1
    ? "1 dia útil"
    : `${productionLeadTimeBusinessDays} dias úteis`
```

For each product section use:

```ts
const paragraphs =
  section.title.trim().toUpperCase() === "PRAZO"
    ? [`Produção e postagem em até ${productionLeadTime}.`]
    : section.paragraphs
```

Render `paragraphs`, leaving all non-`PRAZO` sections untouched.

### Task 5: Verify and integrate

**Files:**
- No additional production files expected.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: green isolated branch and fast-forwarded `feat/phase-7-store-settings`.

- [ ] **Step 1: Verify GREEN**

Run CI for the implementation commit and require typecheck, KingHost build, route/startup checks, TypeScript runner, and full tests to pass.

- [ ] **Step 2: Review diff**

Confirm no migration/schema/admin-value changes and no unrelated infrastructure/contact constants were rewritten.

- [ ] **Step 3: Fast-forward the original Phase 7 branch**

Move `feat/phase-7-store-settings` to the verified isolated-branch head without force.

- [ ] **Step 4: Do not deploy automatically**

Return the validated commit and resume deployment only with the user.