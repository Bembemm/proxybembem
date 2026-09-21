# Admin Product Catalog and Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ProxyBembem products from the hardcoded catalog to a Supabase-backed source of truth, add protected admin product management with image upload and lifecycle control, then redesign the existing admin around the approved sidebar layout.

**Architecture:** Supabase `public.products` is the only runtime catalog authority. Public reads return only `published` rows; checkout resolves product IDs and quantities against current server-side catalog data; admin mutations reuse the existing MFA + admin-session gate and use optimistic concurrency. Product images use a public-read/private-write Supabase Storage bucket with admin-authorized signed uploads. The rollout is staged so catalog cutover is proven before product-management UI, and product-management is proven before the global admin layout redesign.

**Tech Stack:** Next.js 16.3.3, React 19, TypeScript 5.7.3, Supabase JS 2.112.4 / Supabase SSR 0.12.5, PostgreSQL 17, Tailwind CSS 4, Node.js 22.x, Vercel native deployment.

**Spec:** `docs/superpowers/specs/2026-09-07-admin-product-catalog-design.md`

## Global Constraints

- Supabase becomes the single runtime source of truth for products.
- Preserve current product IDs `1` and `2` and all equivalent catalog data during migration.
- Product lifecycle is exactly `draft | published | archived`; there is no physical-delete admin flow.
- Reactivate archived products to `draft`; publishing remains explicit.
- Store prices as integer cents.
- Public storefront reads expose only `published` products.
- Checkout trusts only server-resolved current product data, never browser-provided prices or shipping metadata.
- Existing orders remain immutable snapshots of purchase-time title, quantity, price, and shipping information.
- Public users may read product images but may not upload, overwrite, or delete them.
- Product mutations and upload authorization require the existing protected admin MFA/AAL2 + active app-session authorization.
- No privileged Supabase service credential may be exposed to the browser.
- Product edits use optimistic concurrency; stale saves fail instead of silently overwriting newer data.
- There is no autosave.
- There is no numeric stock/inventory in this version.
- The static `data/products.ts` catalog stays temporarily as rollback evidence during Stage 1 but must not remain a runtime fallback after cutover acceptance.
- Existing admin login, MFA, session expiry, logout, and no-store/cache-security semantics must not change.
- New admin styling keeps the existing violet/slate ProxyBembem identity.
- Node version remains exactly `22.1.0`; package manager remains pnpm 10; Vercel build remains `pnpm build`.
- Every implementation task follows RED → verify exact failure → minimal GREEN → focused verification → commit.
- Do not reapply previously applied migrations. The product-catalog migration is a new migration applied once.

---

## Stage 1 — Catalog foundation and runtime cutover

### Task 1: Create the product catalog schema, seed data, and image bucket

**Files:**
- Create: `supabase/migrations/202609070001_product_catalog.sql`
- Test: `tests/product-catalog-migration.test.ts`
- Read before implementation: `data/products.ts`

**Interfaces:**
- Consumes: the two existing hardcoded products in `data/products.ts`.
- Produces: `public.products`, lifecycle constraints, deterministic seed rows `id=1` and `id=2`, a `product-images` Storage bucket, and public-read/private-write Storage policy posture.

- [ ] **Step 1: Write the failing migration contract test**

Create `tests/product-catalog-migration.test.ts` that reads the SQL migration and asserts the required schema and seed invariants. The test must include checks equivalent to:

```ts
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL("../supabase/migrations/202609070001_product_catalog.sql", import.meta.url),
  "utf8",
)

test("product catalog migration preserves current ids and lifecycle", () => {
  assert.match(migration, /create table(?: if not exists)? public\.products/i)
  assert.match(migration, /status[^\n]+draft[^\n]+published[^\n]+archived/i)
  assert.match(migration, /original_price_cents/i)
  assert.match(migration, /price_cents/i)
  assert.match(migration, /updated_at/i)
  assert.match(migration, /insert into public\.products/i)
  assert.match(migration, /\b1\b/)
  assert.match(migration, /\b2\b/)
  assert.match(migration, /product-images/i)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm test -- tests/product-catalog-migration.test.ts
```

Expected: FAIL because `supabase/migrations/202609070001_product_catalog.sql` does not exist.

- [ ] **Step 3: Verify current Supabase guidance before writing DDL**

Read current official Supabase documentation for Storage bucket creation, object policies, and signed upload URLs. Confirm current function/API names before implementation. Do not copy an old Storage policy pattern from memory.

- [ ] **Step 4: Implement the migration**

Create `public.products` with at least these columns and constraints:

```sql
id bigint generated by default as identity primary key,
status text not null check (status in ('draft', 'published', 'archived')),
title text not null,
category text not null,
tag text,
featured boolean not null default false,
image_path text not null,
original_price_cents integer not null check (original_price_cents > 0),
price_cents integer not null check (price_cents > 0),
description text not null,
notice text,
colors jsonb not null default '[]'::jsonb,
highlights jsonb not null default '[]'::jsonb,
details jsonb not null default '[]'::jsonb,
sections jsonb not null default '[]'::jsonb,
shipping_weight_kg numeric(10,3) not null check (shipping_weight_kg > 0),
shipping_length_cm numeric(10,2) not null check (shipping_length_cm > 0),
shipping_width_cm numeric(10,2) not null check (shipping_width_cm > 0),
shipping_height_cm numeric(10,2) not null check (shipping_height_cm > 0),
display_order integer not null default 0,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
```

Add a trigger that updates `updated_at` on every row update. Enable RLS. Do not grant anonymous table mutation privileges. Seed products `1` and `2` with data equivalent to `data/products.ts`, both as `published`. After explicit-ID inserts, advance the identity sequence so the next generated ID is greater than `2`.

Create bucket `product-images` with public read enabled and no public write policy. Storage mutations will later use a trusted server-generated signed upload URL rather than browser service credentials.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
pnpm test -- tests/product-catalog-migration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Apply the new migration once to the connected Supabase project**

Use the Supabase connector against project `kicgoocozxzkuoqajqif`. Apply only `202609070001_product_catalog.sql`. Do not reapply any existing migration.

- [ ] **Step 7: Validate live database state**

Run live SQL checks equivalent to:

```sql
select id, status, title, original_price_cents, price_cents, image_path
from public.products
order by id;

select count(*) filter (where id = 1) as has_1,
       count(*) filter (where id = 2) as has_2
from public.products;
```

Expected: exactly the two migrated current products, IDs `1` and `2`, both `published`, with the current product values represented in cents.

Run Supabase security/performance advisors after DDL. Treat intentional backend-only warnings explicitly; do not ignore unexpected policy/security warnings.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/202609070001_product_catalog.sql tests/product-catalog-migration.test.ts
git commit -m "feat: add Supabase product catalog"
```

### Task 2: Add shared product domain parsing and server catalog repository

**Files:**
- Create: `lib/products/product.ts`
- Create: `lib/server/product-catalog.ts`
- Create: `lib/server/supabase-service.ts`
- Test: `tests/product-catalog-repository.test.ts`
- Modify later consumers only after this task is green.

**Interfaces:**
- Produces:
  - `type ProductStatus = "draft" | "published" | "archived"`
  - `interface Product` using existing UI field names (`id`, `title`, `image`, `originalPrice`, `discountPrice`, etc.) plus `status`, `updatedAt`, and `displayOrder` where needed.
  - `parseProductRow(value: unknown): Product`
  - `listPublishedProducts(): Promise<Product[]>`
  - `getPublishedProductsByIds(ids: number[]): Promise<Product[]>`
  - `listAdminProducts(input): Promise<AdminProductListResult>`
  - `getAdminProduct(id: number): Promise<Product | null>`
- `lib/server/supabase-service.ts` creates a server-only Supabase client using `SUPABASE_URL` + `SUPABASE_SECRET_KEY` and must never be imported by client modules.

- [ ] **Step 1: Write repository tests with dependency injection**

Use a fake query adapter so tests do not need network access. Cover:

```ts
test("published catalog maps database cents to current Product shape", async () => {})
test("public catalog rejects malformed database rows", async () => {})
test("public id lookup never returns draft or archived rows", async () => {})
test("admin catalog accepts all three lifecycle states", async () => {})
```

The fake published row for product `1` must map `11990` cents to `discountPrice: 119.9` and preserve shipping metadata.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
pnpm test -- tests/product-catalog-repository.test.ts
```

Expected: FAIL because the product domain/repository modules do not exist.

- [ ] **Step 3: Implement the shared product parser**

Move the reusable product interfaces out of `contexts/cart-context.tsx` into `lib/products/product.ts`. Preserve current UI-compatible names so storefront components do not need unnecessary visual rewrites.

Validate bounded strings, arrays/object shapes, positive prices, positive shipping values, and valid lifecycle state. Convert cents to decimal display values only at the domain/UI boundary.

- [ ] **Step 4: Implement the server-only Supabase service client**

Use `createClient` from `@supabase/supabase-js` with `getSupabaseEnv()` and no persisted auth session. Keep this file server-only and never export secrets.

- [ ] **Step 5: Implement catalog reads**

`listPublishedProducts()` must query only `status = 'published'`, ordered by `display_order`, then `id`.

`getPublishedProductsByIds(ids)` must return only published rows and must not silently manufacture missing products.

Admin reads may return all statuses but remain server-only.

- [ ] **Step 6: Run focused tests and typecheck**

```bash
pnpm test -- tests/product-catalog-repository.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/products/product.ts lib/server/product-catalog.ts lib/server/supabase-service.ts tests/product-catalog-repository.test.ts
git commit -m "feat: add product catalog repository"
```

### Task 3: Make checkout resolve products asynchronously from Supabase

**Files:**
- Modify: `lib/server/checkout-order.ts`
- Modify: `lib/server/checkout-flow.ts`
- Modify: `lib/server/shipping-quote.ts` if it directly depends on the static catalog path
- Modify: focused tests that import `buildCheckoutOrder`
- Test: `tests/checkout-order.test.ts`
- Test: `tests/mixed-checkout-flow.test.ts`

**Interfaces:**
- Replace the static synchronous catalog dependency with an injected async resolver:

```ts
export type ResolveCheckoutProducts = (ids: number[]) => Promise<Product[]>

export async function buildCheckoutOrder(
  value: unknown,
  resolveProducts: ResolveCheckoutProducts = getPublishedProductsByIds,
): Promise<CheckoutOrder>
```

- `executeCheckoutFlow` awaits `buildCheckoutOrder` and defaults to the Supabase published-product resolver.

- [ ] **Step 1: Update tests first**

Add/modify tests proving:

```ts
test("rebuilds checkout title price and shipping from resolver, not browser data", async () => {})
test("rejects a draft archived or missing product because resolver omits it", async () => {})
test("uses a changed current price returned by resolver", async () => {})
```

Keep the existing quantity limits and duplicate-line aggregation behavior unchanged.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm test -- tests/checkout-order.test.ts tests/mixed-checkout-flow.test.ts
```

Expected: FAIL because `buildCheckoutOrder` is still synchronous and imports `data/products.ts`.

- [ ] **Step 3: Implement minimal async checkout resolution**

Remove the runtime import from `data/products.ts`. Resolve the unique product IDs once. Require every requested ID to resolve to a current `published` product; otherwise throw `Unknown product`/validation error before any payment preference can be created.

- [ ] **Step 4: Update checkout-flow dependency types**

Make `ReturnType<typeof buildCheckoutOrder>` usages use `Awaited<ReturnType<typeof buildCheckoutOrder>>` where necessary, and await the build before fingerprinting, shipping quote validation, order reservation, and Mercado Pago preference creation.

- [ ] **Step 5: Run checkout-focused tests and typecheck**

```bash
pnpm test -- tests/checkout-order.test.ts tests/mixed-checkout-flow.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/server/checkout-order.ts lib/server/checkout-flow.ts lib/server/shipping-quote.ts tests/checkout-order.test.ts tests/mixed-checkout-flow.test.ts
git commit -m "feat: resolve checkout products from Supabase"
```

### Task 4: Cut public storefront reads over to Supabase

**Files:**
- Modify: `app/produtos/page.tsx`
- Modify: `components/pages/products-page.tsx`
- Modify: `app/page.tsx` and/or `components/pages/home-page.tsx` according to current ownership of featured products
- Create: `app/api/catalog/route.ts`
- Test: `tests/storefront-product-catalog.test.ts`
- Modify: `tests/home-storefront-merge.test.ts`

**Interfaces:**
- `ProductsPage` receives `products: Product[]` as a prop instead of importing the static catalog.
- `/api/catalog` returns a bounded JSON payload of current published products for cart reconciliation.
- Home receives/loads `featured` published products from the same repository.

- [ ] **Step 1: Write failing storefront contract tests**

Assert that public product components no longer import `@/data/products`, that the products page loads `listPublishedProducts`, and that `/api/catalog` uses the same server repository.

Include a test that a controlled catalog read failure renders a temporary-unavailable state instead of falling back to static catalog data.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm test -- tests/storefront-product-catalog.test.ts tests/home-storefront-merge.test.ts
```

Expected: FAIL because storefront components still import `data/products.ts`.

- [ ] **Step 3: Convert `/produtos` to server-loaded catalog data**

Make `app/produtos/page.tsx` async, call `listPublishedProducts()`, and pass the resulting array to `ProductsPage`.

Change `ProductsPage({ products }: { products: Product[] })` and compute categories from the prop.

- [ ] **Step 4: Convert home featured products**

Load published products server-side and pass only `product.featured === true` to the current home client component. Preserve current visible storefront copy and layout.

- [ ] **Step 5: Add the public catalog reconciliation endpoint**

Create `GET /api/catalog` returning only published products. On repository failure, return `503` with a small safe body such as `{ "error": "catalog_unavailable" }`; never return static prices.

- [ ] **Step 6: Run focused tests, typecheck, and build**

```bash
pnpm test -- tests/storefront-product-catalog.test.ts tests/home-storefront-merge.test.ts
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/produtos/page.tsx components/pages/products-page.tsx app/page.tsx components/pages/home-page.tsx app/api/catalog/route.ts tests/storefront-product-catalog.test.ts tests/home-storefront-merge.test.ts
git commit -m "feat: load storefront catalog from Supabase"
```

### Task 5: Reconcile persisted carts against the live catalog

**Files:**
- Modify: `contexts/cart-context.tsx`
- Modify: `lib/cart-storage.ts` only if its current payload shape needs a compatible parser change
- Modify: `components/cart-panel.tsx` or the existing cart feedback surface
- Test: `tests/cart-storage.test.ts`
- Create: `tests/cart-catalog-reconciliation.test.ts`

**Interfaces:**
- Persisted browser cart remains `{ productId, quantity }[]` only.
- Cart hydration fetches `/api/catalog`, resolves current product data, removes unavailable IDs, and exposes a one-time message when lines disappear.

- [ ] **Step 1: Write failing cart reconciliation tests**

Cover:

```ts
test("restored cart adopts the current catalog price", () => {})
test("restored cart drops a product missing from published catalog", () => {})
test("persisted storage still contains only product id and quantity", () => {})
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm test -- tests/cart-storage.test.ts tests/cart-catalog-reconciliation.test.ts
```

Expected: FAIL because `CartProvider` still imports `products` from `data/products.ts`.

- [ ] **Step 3: Remove the static catalog import from CartProvider**

Hydration flow:

1. Parse stored ID/quantity lines.
2. Fetch `/api/catalog` with `cache: "no-store"`.
3. Resolve each stored line against returned current products.
4. Drop missing/draft/archived IDs because the endpoint returns published only.
5. Keep quantity within existing validation rules.
6. Save the reconciled ID/quantity payload back to localStorage.

If the catalog endpoint is temporarily unavailable, do not replace valid localStorage with an empty cart. Show a retry-safe unavailable state and defer reconciliation rather than inventing stale checkout authority.

- [ ] **Step 4: Add one-time unavailable-product feedback**

Expose a small cart notice such as `Um produto do seu carrinho não está mais disponível.` when reconciliation removes at least one line.

- [ ] **Step 5: Run focused tests and full typecheck**

```bash
pnpm test -- tests/cart-storage.test.ts tests/cart-catalog-reconciliation.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add contexts/cart-context.tsx lib/cart-storage.ts components/cart-panel.tsx tests/cart-storage.test.ts tests/cart-catalog-reconciliation.test.ts
git commit -m "feat: reconcile carts with live product catalog"
```

### Task 6: Stage 1 verification and production acceptance checkpoint

**Files:**
- Modify: `docs/superpowers/CURRENT_STATUS.md`
- No new runtime feature code unless verification reveals a real defect.

**Interfaces:**
- Produces a proven Supabase-backed runtime catalog before admin mutation UI begins.

- [ ] **Step 1: Run the complete automated gate on the exact Stage 1 SHA**

```bash
nvm use
npx pnpm@10 install --frozen-lockfile
npx pnpm@10 test
npx pnpm@10 typecheck
NODE_ENV=production npx pnpm@10 build
```

Also run the existing private-order route gate and Vercel runtime smoke command used by CI.

Expected: all tests pass, typecheck passes, Vercel build passes, route gate passes, startup smoke passes.

- [ ] **Step 2: Re-run live Supabase catalog validation**

Verify rows `1` and `2`, statuses, prices, and Storage bucket posture. Verify no unexpected Supabase advisor regressions.

- [ ] **Step 3: Deploy Stage 1 to Vercel and perform owner acceptance**

Use the canonical Vercel runbook. Validate without completing a paid Mercado Pago transaction:

- `/produtos` shows both current products with unchanged content/prices.
- Home featured product still renders correctly.
- Existing cart reload adopts the current catalog data.
- A shipping quote can be calculated.
- Checkout reaches the authenticated pre-payment flow and rebuilds product data successfully.

- [ ] **Step 4: Update current status and commit**

Record Stage 1 acceptance and exact accepted SHA in `docs/superpowers/CURRENT_STATUS.md`.

```bash
git add docs/superpowers/CURRENT_STATUS.md
git commit -m "docs: record product catalog cutover"
```

Do not remove `data/products.ts` yet; retain it as rollback evidence until Stage 2 is also accepted, but ensure no runtime import remains.

---

## Stage 2 — Protected product administration

### Task 7: Add validated admin product mutation repository with optimistic concurrency

**Files:**
- Create: `lib/server/admin-products.ts`
- Create: `lib/products/product-form.ts`
- Test: `tests/admin-products.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ProductMutationInput {
  title: string
  category: string
  tag: string | null
  featured: boolean
  imagePath: string
  originalPriceCents: number
  priceCents: number
  description: string
  notice: string | null
  colors: string[]
  highlights: string[]
  details: Array<{ label: string; value: string }>
  sections: Array<{ title: string; paragraphs: string[] }>
  shipping: { weightKg: number; lengthCm: number; widthCm: number; heightCm: number }
  displayOrder: number
}

export async function createDraftProduct(input: ProductMutationInput): Promise<Product>
export async function updateProduct(id: number, expectedUpdatedAt: string, input: ProductMutationInput): Promise<Product>
export async function publishProduct(id: number, expectedUpdatedAt: string): Promise<Product>
export async function archiveProduct(id: number, expectedUpdatedAt: string): Promise<Product>
export async function reactivateProduct(id: number, expectedUpdatedAt: string): Promise<Product>
```

- Stale updates throw a dedicated `ProductConflictError`.

- [ ] **Step 1: Write failing domain and repository tests**

Cover field bounds, positive price/shipping validation, draft creation, explicit publish, archive without delete, reactivate-to-draft, and stale `updated_at` conflict.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm test -- tests/admin-products.test.ts
```

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement form validation**

Return structured field errors rather than a generic boolean. Validation must reject empty title/category/description, non-positive price or shipping values, malformed repeatable sections, and unreasonably large text/array payloads.

- [ ] **Step 4: Implement compare-and-swap updates**

For updates/lifecycle changes, issue an update filtered by both `id` and the exact expected `updated_at`. If zero rows are returned but the product still exists, throw `ProductConflictError`.

Never implement physical deletion.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
pnpm test -- tests/admin-products.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/server/admin-products.ts lib/products/product-form.ts tests/admin-products.test.ts
git commit -m "feat: add protected product mutations"
```

### Task 8: Add protected admin product API routes

**Files:**
- Create: `app/api/admin/products/route.ts`
- Create: `app/api/admin/products/[id]/route.ts`
- Create: `app/api/admin/products/[id]/publish/route.ts`
- Create: `app/api/admin/products/[id]/archive/route.ts`
- Create: `app/api/admin/products/[id]/reactivate/route.ts`
- Test: `tests/admin-product-routes.test.ts`

**Interfaces:**
- Every mutation starts with `authorizeAdminAccess({ touch: true })` or the existing route-equivalent admin gate.
- Unauthorized/non-admin/MFA-incomplete requests receive a controlled `401/403`-class response without leaking data.
- Stale revision returns `409` and `{ error: "product_conflict" }`.
- Invalid form returns `400` and structured field errors.

- [ ] **Step 1: Write failing route contract tests**

Assert every route references the existing admin authorization boundary before mutation and maps validation/conflict errors to stable response codes.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm test -- tests/admin-product-routes.test.ts
```

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Implement create/update routes**

`POST /api/admin/products` creates a draft. `PATCH /api/admin/products/:id` updates fields and requires `expectedUpdatedAt` in the body.

- [ ] **Step 4: Implement lifecycle routes**

Publish, archive, and reactivate use separate explicit POST routes and require the expected revision. Archive never deletes.

- [ ] **Step 5: Add catalog freshness invalidation**

After successful mutation, invalidate the relevant public catalog cache path/tag if caching is used; if public catalog reads are dynamic/no-store, preserve that contract explicitly and do not add stale caching merely for this task.

- [ ] **Step 6: Run focused tests and typecheck**

```bash
pnpm test -- tests/admin-product-routes.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/admin/products lib/server/admin-products.ts tests/admin-product-routes.test.ts
git commit -m "feat: add admin product API"
```

### Task 9: Add admin-authorized direct image upload to Supabase Storage

**Files:**
- Create: `app/api/admin/products/image-upload/route.ts`
- Create: `lib/server/product-images.ts`
- Test: `tests/admin-product-images.test.ts`

**Interfaces:**
- `POST /api/admin/products/image-upload` accepts validated metadata only: original filename, MIME type, and byte size.
- Server validates protected admin access, MIME type, max size, and generates a unique immutable object path.
- Server returns a short-lived signed upload token/URL using current Supabase Storage APIs.
- Browser uploads bytes directly to Supabase Storage.

- [ ] **Step 1: Write failing image authorization tests**

Cover:

```ts
test("image upload authorization requires active admin access", () => {})
test("rejects non-image mime types", () => {})
test("rejects images above configured maximum", () => {})
test("generates immutable unique product image paths", () => {})
```

Use an explicit first-version limit of 8 MiB and allow `image/jpeg`, `image/png`, and `image/webp`.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm test -- tests/admin-product-images.test.ts
```

Expected: FAIL because the image upload modules do not exist.

- [ ] **Step 3: Implement path generation and validation**

Generate paths equivalent to:

```ts
`products/${crypto.randomUUID()}.${extension}`
```

Never overwrite an existing object path.

- [ ] **Step 4: Implement signed upload authorization**

Use the current official Supabase Storage signed-upload API confirmed in Task 1. Return only what the browser needs for the direct upload; never return `SUPABASE_SECRET_KEY`.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
pnpm test -- tests/admin-product-images.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/products/image-upload/route.ts lib/server/product-images.ts tests/admin-product-images.test.ts
git commit -m "feat: add admin product image uploads"
```

### Task 10: Build the protected product list page

**Files:**
- Create: `app/admin/produtos/page.tsx`
- Create: `components/admin/products/product-list.tsx`
- Modify: `components/admin/admin-nav.tsx`
- Test: `tests/admin-products-ui.test.ts`

**Interfaces:**
- `/admin/produtos` calls `requireAdminPageAccess({ touch: true })` before catalog reads.
- Supports query params `q` and `status` with bounded parsing.
- Displays thumbnail, title, status, current price, category, featured state, updated timestamp, and Edit action.
- Provides `Novo produto` link to `/admin/produtos/novo`.

- [ ] **Step 1: Write failing UI structure tests**

Assert new protected route, Products nav item, list columns/content, lifecycle filter labels, search input, and `Novo produto` action.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm test -- tests/admin-products-ui.test.ts
```

Expected: FAIL because `/admin/produtos` and nav item do not exist.

- [ ] **Step 3: Add `products` to `AdminSection` and nav**

Keep current violet active state semantics. Do not redesign the whole shell yet; Stage 3 owns that.

- [ ] **Step 4: Implement protected list route and responsive list UI**

Desktop may use a table; mobile must use compact cards or a responsive table treatment that does not require browser zoom.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
pnpm test -- tests/admin-products-ui.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/admin/produtos/page.tsx components/admin/products/product-list.tsx components/admin/admin-nav.tsx tests/admin-products-ui.test.ts
git commit -m "feat: add admin product list"
```

### Task 11: Build the product create/edit form and lifecycle actions

**Files:**
- Create: `app/admin/produtos/novo/page.tsx`
- Create: `app/admin/produtos/[id]/page.tsx`
- Create: `components/admin/products/product-form.tsx`
- Create: `components/admin/products/repeatable-fields.tsx`
- Create: `components/admin/products/product-image-field.tsx`
- Create: `components/admin/products/product-lifecycle-actions.tsx`
- Test: `tests/admin-product-editor-ui.test.ts`

**Interfaces:**
- No autosave.
- Explicit `Salvar alterações`, `Publicar`, `Arquivar`, and `Reativar` actions.
- New products begin in `draft`.
- Archive requires confirmation.
- Reactivate returns to `draft`.
- Unsaved changes trigger a browser navigation warning.
- Image selection uploads first to a unique Storage object, but the product keeps the old `image_path` until the product PATCH/POST succeeds.

- [ ] **Step 1: Write failing editor UI tests**

Assert visible sections and labels:

```text
Informações básicas
Preços
Imagem
Descrição e conteúdo
Frete e dimensões
Publicação
Salvar alterações
Publicar
Arquivar
Reativar
```

Assert no raw JSON textarea is used for highlights/details/sections.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm test -- tests/admin-product-editor-ui.test.ts
```

Expected: FAIL because editor routes/components do not exist.

- [ ] **Step 3: Implement form state and normal field controls**

Use Brazilian currency display inputs while converting to integer cents before API submission. Build repeatable add/remove/reorder controls for highlights, details, and sections.

Keep `Frete e dimensões` collapsed by default using the existing Radix Accordion dependency.

- [ ] **Step 4: Implement direct image upload client flow**

1. Validate file locally.
2. Request admin upload authorization.
3. Upload directly to Supabase Storage.
4. Hold the new `imagePath` in unsaved form state.
5. Submit product save.
6. Only after save success display the new path as persisted.

On save failure, keep the previous persisted image active and show the error. Automatic orphan cleanup is intentionally not added.

- [ ] **Step 5: Implement optimistic conflict UX**

On API `409 product_conflict`, show:

```text
Este produto foi alterado em outra sessão. Recarregue antes de salvar.
```

Do not automatically retry a stale write.

- [ ] **Step 6: Implement lifecycle UX and unsaved-change warning**

Archive uses an explicit confirmation dialog. Reactivation goes to draft. Publishing validates all storefront/checkout-required fields.

- [ ] **Step 7: Run focused tests, typecheck, and build**

```bash
pnpm test -- tests/admin-product-editor-ui.test.ts tests/admin-products-ui.test.ts tests/admin-product-routes.test.ts tests/admin-product-images.test.ts
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/admin/produtos components/admin/products tests/admin-product-editor-ui.test.ts
git commit -m "feat: add admin product editor"
```

### Task 12: Stage 2 full verification and production acceptance

**Files:**
- Modify: `docs/superpowers/CURRENT_STATUS.md`

- [ ] **Step 1: Run the complete automated gate**

```bash
npx pnpm@10 test
npx pnpm@10 typecheck
NODE_ENV=production npx pnpm@10 build
```

Also run existing admin auth/cache regression tests, private-order route gate, and Vercel runtime smoke.

- [ ] **Step 2: Deploy exact Stage 2 SHA to Vercel**

Use the canonical Vercel deployment commands and restart from the Vercel dashboard.

- [ ] **Step 3: Perform safe production acceptance with a test/draft product**

Validate:

1. Create draft product.
2. Upload JPEG/PNG/WebP image from computer.
3. Save changes without publishing; confirm it does not appear publicly.
4. Publish; confirm it appears in `/produtos`.
5. Change price; refresh storefront/cart; confirm current price changes.
6. Archive; confirm it disappears from storefront and cannot proceed through checkout.
7. Reactivate; confirm it returns to draft, not public.
8. Open two edit tabs and confirm stale save returns the conflict message.

Do not complete a real paid Mercado Pago transaction.

- [ ] **Step 4: Record Stage 2 acceptance**

Update `CURRENT_STATUS.md` with exact accepted SHA and observed production acceptance.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/CURRENT_STATUS.md
git commit -m "docs: record admin product acceptance"
```

After Stage 2 acceptance, remove any remaining runtime imports of `data/products.ts`. If zero runtime imports remain and rollback is no longer needed, remove `data/products.ts` in a separate tested commit; historical docs/tests may still reference the former path only when intentionally documenting the migration.

---

## Stage 3 — Global admin sidebar redesign

### Task 13: Replace the admin top-nav shell with the approved sidebar shell

**Files:**
- Modify: `components/admin/admin-shell.tsx`
- Modify: `components/admin/admin-nav.tsx`
- Create: `components/admin/admin-mobile-nav.tsx`
- Test: `tests/admin-sidebar-ui.test.ts`
- Modify: `tests/admin-auth-ui.test.ts`

**Interfaces:**
- Desktop navigation: persistent/sticky left sidebar.
- Mobile navigation: dismissible drawer/menu.
- Sections exactly: Visão geral, Pedidos, Produção, Produtos, Integrações, Sair.
- Existing `AdminShell({ activeSection, title, description, children })` API remains stable where practical so existing pages need minimal change.

- [ ] **Step 1: Write failing sidebar structure tests**

Assert the sidebar labels, active-section semantics, mobile menu control, violet active styling, and logout placement. Assert old top-nav-specific structural contract is removed.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm test -- tests/admin-sidebar-ui.test.ts tests/admin-auth-ui.test.ts
```

Expected: FAIL because current admin shell still uses the header/top navigation structure.

- [ ] **Step 3: Implement the desktop sidebar shell**

Use existing slate/white/violet tokens and rounded card style. Keep `main` content right of the sidebar, with page title/description and page actions/content. Do not alter login or MFA pages.

- [ ] **Step 4: Implement mobile drawer navigation**

Use the installed Radix Dialog primitive or the project’s existing dialog wrapper. Ensure keyboard focus, close button, and route navigation are usable without horizontal zoom.

- [ ] **Step 5: Preserve logout and admin no-store semantics**

Logout remains a POST form to `/api/admin/logout`. Do not change proxy cache logic or MFA/session validation as part of visual redesign.

- [ ] **Step 6: Run focused tests and typecheck**

```bash
pnpm test -- tests/admin-sidebar-ui.test.ts tests/admin-auth-ui.test.ts tests/admin-production-regressions.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/admin/admin-shell.tsx components/admin/admin-nav.tsx components/admin/admin-mobile-nav.tsx tests/admin-sidebar-ui.test.ts tests/admin-auth-ui.test.ts
git commit -m "feat: redesign admin with sidebar navigation"
```

### Task 14: Adapt existing admin pages to the shared sidebar layout

**Files:**
- Modify: `app/admin/page.tsx`
- Modify: `app/admin/pedidos/page.tsx`
- Modify: `app/admin/pedidos/[id]/page.tsx`
- Modify: `app/admin/producao/page.tsx`
- Modify: `app/admin/integrations/melhor-envio/page.tsx`
- Modify: `app/admin/produtos/page.tsx`
- Modify: `app/admin/produtos/[id]/page.tsx`
- Modify: `app/admin/produtos/novo/page.tsx`
- Test: `tests/admin-sidebar-pages.test.ts`

**Interfaces:**
- Every protected page continues calling `requireAdminPageAccess` exactly as before.
- Existing orders/production/integration behavior is preserved; this task changes presentation and responsive layout only.

- [ ] **Step 1: Write failing page integration tests**

For each protected admin route, assert use of the shared `AdminShell` with the correct `activeSection`. Add structural checks that orders/products data is usable on narrow layouts without requiring a permanently wide top navigation.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm test -- tests/admin-sidebar-pages.test.ts
```

Expected: FAIL for pages not yet adapted to the new shell expectations.

- [ ] **Step 3: Adapt overview and integrations**

Keep their existing actions and copy; fit them into the new content region.

- [ ] **Step 4: Adapt orders and order detail**

Preserve filters, pagination, links, status actions, and exact server data behavior. Make wide tables responsive without deleting information.

- [ ] **Step 5: Adapt production and product management**

Keep all current operations and form behaviors; only reconcile spacing/layout with the new shell.

- [ ] **Step 6: Run focused tests, admin regression suite, and typecheck**

```bash
pnpm test -- tests/admin-sidebar-pages.test.ts tests/admin-production-regressions.test.ts tests/admin-products-ui.test.ts tests/admin-product-editor-ui.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/admin tests/admin-sidebar-pages.test.ts
git commit -m "feat: adapt admin pages to sidebar layout"
```

### Task 15: Final verification, documentation reconciliation, and production acceptance

**Files:**
- Modify: `docs/superpowers/CURRENT_STATUS.md`
- Modify: `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md`
- Modify: `docs/superpowers/README.md`
- Modify: `docs/payments-setup.md`
- Modify: `docs/shipping-setup.md`

**Interfaces:**
- Produces final verified branch state; does not merge or start a new phase automatically.

- [ ] **Step 1: Run fresh full verification on the exact final SHA**

```bash
nvm use
npx pnpm@10 install --frozen-lockfile
npx pnpm@10 test
npx pnpm@10 typecheck
NODE_ENV=production npx pnpm@10 build
```

Also run the private-order route gate and Vercel runtime smoke. Record exact test count and exact SHA.

- [ ] **Step 2: Re-run Supabase validation/advisors**

Verify product schema, product IDs, lifecycle state, Storage bucket posture, and no unexpected security/performance advisor findings.

- [ ] **Step 3: Deploy final SHA and perform production acceptance**

With browser cache normally enabled, verify:

- admin login + MFA
- sidebar navigation on desktop
- mobile navigation
- Pedidos page and at least two order details
- Produção
- Integrações / Melhor Envio
- Produtos list
- create/edit/save test product
- image upload
- publish/archive/reactivate
- stale-edit conflict
- storefront visibility
- cart current-price reconciliation
- checkout server re-resolution without real paid transaction
- logout invalidates access and cached admin content cannot be reused

- [ ] **Step 4: Reconcile operational documentation**

Update the five live/operational docs listed above. Historical plan/spec files remain historical and should not be rewritten to look current.

`CURRENT_STATUS.md` must identify the final accepted SHA and the next exact action as owner integration choice, not Phase 4 auto-start.

- [ ] **Step 5: Run full verification once more after docs-only edits**

At minimum:

```bash
npx pnpm@10 test
npx pnpm@10 typecheck
```

If any runtime file changed during documentation reconciliation, rerun the full Vercel build and smoke gates too.

- [ ] **Step 6: Commit final documentation**

```bash
git add docs
git commit -m "docs: reconcile product admin rollout status"
```

- [ ] **Step 7: Stop for owner integration choice**

Do not merge `feat/admin-dashboard-expansion` and do not start Phase 4 automatically. Use the finishing-development-branch workflow and present the integration options to the owner.
