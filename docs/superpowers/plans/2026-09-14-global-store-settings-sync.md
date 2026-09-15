# Global Store Settings Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Phase 7 store settings the single public source of truth everywhere those same contact and production-lead-time values are shown.

**Architecture:** Keep the existing store-settings validation/cache layer intact. Refresh the App Router after a successful admin mutation, convert policy pages to cached settings consumers, and pass the cached global production lead time into product-detail rendering where stale `PRAZO` sections and known lead-time quick-info highlights are overridden at presentation time.

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

- [x] **Step 1: Write failing tests**

Assertions cover:

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
assert.match(productModal, /PRODUCTION_LEAD_TIME_HIGHLIGHT/)
assert.match(productModal, /section\.title\.trim\(\)\.toUpperCase\(\)\s*===\s*["']PRAZO["']/)
```

- [x] **Step 2: Run the test to verify RED**

The isolated branch CI proved the initial three regressions fail before production changes. A follow-up regression assertion also caught the seeded `Produção em até 5 dias úteis` quick-info highlight before its renderer was fixed.

- [x] **Step 3: Keep regression coverage in the branch**

The tests remain part of the final verified tree.

### Task 2: Refresh public projection after admin save

**Files:**
- Modify: `components/admin/settings/store-settings-form.tsx`

**Interfaces:**
- Consumes: successful PATCH response and existing `saved` settings parsing.
- Produces: `router.refresh()` after successful durable save only.

- [x] **Step 1: Implement minimal refresh behavior**

Import `useRouter` from `next/navigation`, create `const router = useRouter()` in `StoreSettingsForm`, and call:

```ts
router.refresh()
```

only after successful saved-settings handling.

- [x] **Step 2: Keep failure paths unchanged**

No refresh is performed on 400, 409, 503, malformed response, or network failure.

### Task 3: Remove hard-coded public policy contact email

**Files:**
- Modify: `app/privacidade/page.tsx`
- Modify: `app/trocas-e-reembolsos/page.tsx`

**Interfaces:**
- Consumes: `getPublicStoreSettings(): Promise<PublicStoreSettings>`.
- Produces: conditional `mailto:` links sourced from `contactEmail`.

- [x] **Step 1: Convert both pages to async server pages**

Both pages read settings through `getPublicStoreSettings()`.

- [x] **Step 2: Render configured email only when present**

The configured email is rendered as plain text/`mailto:` when present. If absent, each page uses neutral contact-channel wording and does not invent a fallback address.

### Task 4: Make product production lead time obey the global setting

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/produtos/page.tsx`
- Modify: `components/pages/home-page.tsx`
- Modify: `components/pages/products-page.tsx`
- Modify: `components/product-detail-modal.tsx`

**Interfaces:**
- Consumes: `getPublicStoreSettings().productionLeadTimeBusinessDays`.
- Produces: `productionLeadTimeBusinessDays: number` prop from server route to client page to `ProductDetailModal`.

- [x] **Step 1: Read the cached setting in both server routes**

Both routes use `getPublicStoreSettings()` and pass only the production lead-time number into their client page component.

- [x] **Step 2: Thread the number through HomePage and ProductsPage**

Every `ProductDetailModal` instance receives the configured production lead time.

- [x] **Step 3: Override only unambiguous lead-time catalog presentations**

`ProductDetailModal` computes singular/plural display text once. It replaces:

```ts
section.title.trim().toUpperCase() === "PRAZO"
```

with `Produção e postagem em até <global prazo>.`, and replaces quick-info highlights only when they match the existing `Produção em até N dia(s) útil(eis)` format. All unrelated sections/highlights remain unchanged.

### Task 5: Verify and integrate

**Files:**
- No additional production files expected.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: green isolated branch and fast-forwarded `feat/phase-7-store-settings`.

- [ ] **Step 1: Verify GREEN**

Require exact KingHost runtime setup, frozen install, typecheck, KingHost build, route/startup checks, TypeScript runner, and full tests to pass on the final squashed commit.

- [x] **Step 2: Review diff scope**

The implementation diff contains only the two policy pages, settings form, two product routes, two product client pages, product modal, regression test, and these design/plan docs. No migration/schema/admin-value files are touched.

- [ ] **Step 3: Fast-forward the original Phase 7 branch**

Move `feat/phase-7-store-settings` to the verified isolated-branch head without force.

- [x] **Step 4: Do not deploy automatically**

Deployment remains a separate user-guided step after verification.