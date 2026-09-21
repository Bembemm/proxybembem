# Storefront Search + Home Carousel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the approved ProxyBembem storefront mockups with the new responsive header, real catalog search, reusable product cards, and a smaller multi-product Home carousel.

**Architecture:** Keep the existing public catalog as the only product source. Extract the current Products Page card into a reusable client component used by both `/produtos` and Home; extend `/produtos` query handling with `busca`; and evolve the existing Navbar/Home carousel rather than introducing new backend services or catalog copies.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, Tailwind CSS 4, lucide-react, Node test runner with source-contract tests.

**Spec:** `docs/superpowers/specs/2026-09-17-storefront-search-carousel-redesign.md`

## Global Constraints

- Do not add or remove visible storefront elements beyond what is represented in the two approved mockups, except the required mobile search interaction.
- Preserve the existing public product catalog, account detection, cart behavior, category menu, ProductDetailModal, FAQ content, footer content, admin-managed catalog data, and checkout behavior.
- Search uses `/produtos?busca=<query>` and combines with category filters using AND semantics.
- Home must show all supplied published products in a horizontal carousel.
- Desktop shows multiple smaller cards; mobile shows one primary card with the next card peeking in.
- Cards preserve admin-managed tag, image, title, original price, discounted price, Add action, and View Details action.
- No new search backend or dependency.

---

### Task 1: Extract the reusable storefront product card

**Files:**
- Create: `components/storefront-product-card.tsx`
- Modify: `components/pages/products-page.tsx`
- Modify: `tests/home-storefront-merge.test.ts`

**Interfaces:**
- Consumes: `Product` from `@/contexts/cart-context`, existing `useCart`, `Button`, `Image`.
- Produces: `StorefrontProductCard({ product, onViewDetails, className? }: { product: Product; onViewDetails: (product: Product) => void; className?: string })`.

- [ ] **Step 1: Write the failing reuse test**

Replace the existing Products Page card-specific assertions with a test that requires a shared component and requires Products Page to render it:

```ts
test("home and products share one storefront product-card presentation", () => {
  const home = source("components/pages/home-page.tsx")
  const products = source("components/pages/products-page.tsx")
  const card = source("components/storefront-product-card.tsx")

  assert.match(home, /StorefrontProductCard/)
  assert.match(products, /StorefrontProductCard/)
  assert.match(card, /product\.tag/)
  assert.match(card, /product\.image/)
  assert.match(card, /product\.title/)
  assert.match(card, /product\.originalPrice/)
  assert.match(card, /product\.discountPrice/)
  assert.match(card, /Adicionar/)
  assert.match(card, /Ver Detalhes/)
  assert.match(card, /addToCart\(product\)/)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test -- tests/home-storefront-merge.test.ts`

Expected: FAIL because `components/storefront-product-card.tsx` does not exist and Home/Products do not use `StorefrontProductCard`.

- [ ] **Step 3: Implement the shared card**

Create `components/storefront-product-card.tsx` as a client component containing the existing Products Page visual language and cart feedback. The public interface must be:

```tsx
export function StorefrontProductCard({
  product,
  onViewDetails,
  className = "",
}: {
  product: Product
  onViewDetails: (product: Product) => void
  className?: string
})
```

The component must:
- render the existing `aspect-[4/3]` image region;
- render `product.tag` as the purple uppercase badge when present;
- render title, original price, discounted price;
- keep the outlined purple `Adicionar` button with temporary green `Adicionado!` feedback;
- call `onViewDetails(product)` from the image and `Ver Detalhes` button;
- keep the same hover/detail behavior currently present on Products Page;
- accept `className` only for outer sizing/layout so Home can size carousel items without forking the card markup.

- [ ] **Step 4: Replace Products Page inline article with the shared card**

Inside `filteredProducts.map`, render:

```tsx
<StorefrontProductCard
  key={product.id}
  product={product}
  onViewDetails={openProductModal}
/>
```

Remove the duplicated local `AddToCartButton`, image card markup, and card-only icon imports from `components/pages/products-page.tsx`.

- [ ] **Step 5: Run focused tests and static checks**

Run:

```bash
pnpm test -- tests/home-storefront-merge.test.ts
pnpm typecheck
```

Expected: the new shared-card contract passes; any Home-specific assertion still referring to the old single-card layout may remain RED until Task 4.

- [ ] **Step 6: Commit**

Commit message: `refactor: share storefront product card`

---

### Task 2: Add real catalog search to `/produtos`

**Files:**
- Modify: `app/produtos/page.tsx`
- Modify: `components/pages/products-page.tsx`
- Modify: `tests/home-storefront-merge.test.ts`

**Interfaces:**
- Consumes: existing `searchParams`, `products`, `initialCategory`.
- Produces: `initialSearch?: string` prop on `ProductsPage` and URL support for `busca`.

- [ ] **Step 1: Write failing search-route/filter tests**

Add:

```ts
test("/produtos accepts a bounded busca query and passes it to ProductsPage", () => {
  const route = source("app/produtos/page.tsx")

  assert.match(route, /busca/)
  assert.match(route, /slice\(0,\s*100\)/)
  assert.match(route, /initialSearch=/)
})

test("ProductsPage combines text search with selected categories", () => {
  const page = source("components/pages/products-page.tsx")

  assert.match(page, /initialSearch\?: string/)
  assert.match(page, /normalizeSearch/)
  assert.match(page, /product\.title/)
  assert.match(page, /product\.category/)
  assert.match(page, /matchesSearch/)
  assert.match(page, /matchesCategory/)
  assert.match(page, /matchesSearch\s*&&\s*matchesCategory/)
})
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `pnpm test -- tests/home-storefront-merge.test.ts`

Expected: FAIL because `busca`, `initialSearch`, and combined search filtering are absent.

- [ ] **Step 3: Extend the route query contract**

Change the route parameter type to:

```ts
searchParams: Promise<{
  categoria?: string | string[]
  busca?: string | string[]
}>
```

Resolve search with:

```ts
const requestedSearch = firstSearchParam(params.busca)?.trim().slice(0, 100)
const initialSearch = requestedSearch || undefined
```

Pass `initialSearch={initialSearch}` to `ProductsPage`. Include both category and search in the component key so URL changes resynchronize client state:

```tsx
key={`${initialCategory ?? "all-products"}:${initialSearch ?? "all-search"}`}
```

- [ ] **Step 4: Add normalized text filtering in Products Page**

Add the prop:

```ts
initialSearch?: string
```

Add a helper:

```ts
function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
}
```

Compute:

```ts
const normalizedSearch = normalizeSearch(initialSearch ?? "")

const filteredProducts = products.filter((product) => {
  const matchesCategory =
    selectedCategories.length === 0 || selectedCategories.includes(product.category)
  const searchableText = normalizeSearch(`${product.title} ${product.category}`)
  const matchesSearch =
    normalizedSearch.length === 0 || searchableText.includes(normalizedSearch)

  return matchesSearch && matchesCategory
})
```

Do not add a second visible search box to Products Page; the approved mockups place search in the header.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm test -- tests/home-storefront-merge.test.ts
pnpm typecheck
```

Expected: search route/filter assertions PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: filter products from header search`

---

### Task 3: Rebuild the responsive public header around the approved mockups

**Files:**
- Modify: `components/navbar.tsx`
- Modify: `tests/home-storefront-merge.test.ts`

**Interfaces:**
- Consumes: `/api/catalog` categories, Supabase auth state, cart context.
- Produces: desktop GET search form to `/produtos`, mobile search toggle, unchanged category/account/cart navigation behavior.

- [ ] **Step 1: Write failing header contract tests**

Add/update assertions to require:

```ts
test("navbar matches approved desktop and mobile search structure", () => {
  const navbar = source("components/navbar.tsx")

  assert.match(navbar, /Search/)
  assert.match(navbar, /name=["']busca["']/)
  assert.match(navbar, /action=["']\/produtos["']/)
  assert.match(navbar, /method=["']get["']/i)
  assert.match(navbar, /Buscar produtos, decks, acessórios\.\.\./)
  assert.match(navbar, /isMobileSearchOpen/)
  assert.match(navbar, /lg:hidden/)
  assert.match(navbar, /hidden[^\n]*lg:/)
  assert.match(navbar, /Categorias/)
  assert.match(navbar, />\s*Início\s*</)
  assert.match(navbar, />\s*Produtos\s*</)
  assert.match(navbar, />\s*Contato\s*</)
})
```

Retain the existing dynamic category, account, and cart assertions.

- [ ] **Step 2: Run focused test and verify RED**

Run: `pnpm test -- tests/home-storefront-merge.test.ts`

Expected: FAIL because header search does not yet exist.

- [ ] **Step 3: Implement desktop header row**

Keep the sticky white header. On `lg` screens render one first row with:
- ProxyBembem brand at left;
- centered/flexible search form;
- `Contato`, account icon, cart icon at right.

The search form must be native GET navigation:

```tsx
<form action="/produtos" method="get" role="search" className="...">
  <input
    type="search"
    name="busca"
    maxLength={100}
    placeholder="Buscar produtos, decks, acessórios..."
    aria-label="Buscar produtos"
    className="..."
  />
  <button type="submit" aria-label="Buscar" className="...">
    <Search className="h-5 w-5" />
  </button>
</form>
```

Keep the second desktop row with `Categorias`, `Início`, and `Produtos` and the existing dynamic category dropdown.

- [ ] **Step 4: Implement the approved mobile resting header**

The visible resting row must be:
- hamburger left;
- brand centered;
- search icon + cart right.

Do not show the account icon or `Contato` directly in the resting mobile row. Add:

```ts
const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
```

Tapping the Search icon reveals a compact GET search form beneath the row. Closing/opening the mobile menu must not break cart/account/category state.

- [ ] **Step 5: Keep account/contact available in mobile menu**

Keep `Início`, `Produtos`, `Contato`; append the resolved `accountItem` link when available. This keeps functionality accessible without adding visual controls to the resting header.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
pnpm test -- tests/home-storefront-merge.test.ts
pnpm typecheck
```

Expected: header/search structure assertions PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: add responsive storefront search header`

---

### Task 4: Replace Home single-product slides with the approved multi-card carousel

**Files:**
- Modify: `components/pages/home-page.tsx`
- Modify: `tests/home-storefront-merge.test.ts`

**Interfaces:**
- Consumes: `products: Product[]`, `StorefrontProductCard`, existing `ProductDetailModal`.
- Produces: responsive multi-card horizontal carousel with viewport-based arrows/dots and `Ver todos` link.

- [ ] **Step 1: Replace old single-slide test with approved carousel contract**

Use assertions like:

```ts
test("home renders the approved multi-card responsive highlights carousel", () => {
  const home = source("components/pages/home-page.tsx")

  assert.match(home, />\s*Destaques\s*</)
  assert.match(home, /Ver todos/)
  assert.match(home, /href=["']\/produtos["']/)
  assert.match(home, /StorefrontProductCard/)
  assert.match(home, /overflow-x-auto/)
  assert.match(home, /snap-start/)
  assert.match(home, /w-\[82vw\]/)
  assert.match(home, /lg:w-\[/)
  assert.match(home, /scrollBy|scrollTo/)
  assert.match(home, /scrollWidth/)
  assert.match(home, /clientWidth/)
  assert.match(home, /ArrowLeft/)
  assert.match(home, /ArrowRight/)
  assert.match(home, /activePage/)
  assert.match(home, /pageCount/)
  assert.doesNotMatch(home, /max-w-\[760px\]/)
  assert.doesNotMatch(home, /md:grid-cols-\[minmax/)
})
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `pnpm test -- tests/home-storefront-merge.test.ts`

Expected: FAIL because Home still uses one full-width product per page.

- [ ] **Step 3: Implement approved section heading row**

Render `Destaques` at left and `/produtos` link at right. Use responsive copy matching the mockups:

```tsx
<a href="/produtos" className="...">
  <span className="sm:hidden">Ver todos →</span>
  <span className="hidden sm:inline">Ver todos os produtos →</span>
</a>
```

Render the desktop-only subtitle under `Destaques`:

```tsx
<p className="mt-1 hidden text-sm text-slate-500 sm:block">
  Os produtos mais procurados pelos nossos clientes
</p>
```

- [ ] **Step 4: Implement multi-card responsive widths**

Inside the horizontal scroller, map every product into a shrink-0 wrapper approximately following:

```tsx
<div
  key={product.id}
  className="w-[82vw] max-w-[320px] shrink-0 snap-start sm:w-[300px] md:w-[280px] lg:w-[270px] xl:w-[260px]"
>
  <StorefrontProductCard
    product={product}
    onViewDetails={openProductModal}
    className="h-full"
  />
</div>
```

Use a flex gap so desktop exposes multiple cards and mobile retains a next-card peek.

- [ ] **Step 5: Convert carousel state to viewport pages**

Keep `carouselRef`, arrow buttons, and resize handling, but calculate:

```ts
const maxScrollLeft = Math.max(carousel.scrollWidth - carousel.clientWidth, 0)
const pageCount = Math.max(1, Math.ceil(carousel.scrollWidth / Math.max(carousel.clientWidth, 1)))
const activePage = Math.min(
  pageCount - 1,
  Math.round(carousel.scrollLeft / Math.max(carousel.clientWidth, 1)),
)
```

For navigation, move approximately one viewport:

```ts
carousel.scrollBy({
  left: direction * carousel.clientWidth * 0.9,
  behavior: "smooth",
})
```

Dots call `scrollTo` with proportional viewport positions and represent viewport pages rather than individual products. Disable arrows at actual left/right scroll boundaries.

- [ ] **Step 6: Preserve modal/cart behavior through the shared card**

`StorefrontProductCard` receives `openProductModal`; `ProductDetailModal` remains unchanged. Home no longer defines its own AddToCartButton.

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm test -- tests/home-storefront-merge.test.ts
pnpm typecheck
```

Expected: Home carousel tests PASS.

- [ ] **Step 8: Commit**

Commit message: `feat: redesign home product carousel`

---

### Task 5: Full regression verification

**Files:**
- Modify only if verification exposes a regression.

**Interfaces:**
- Consumes: all prior task output.
- Produces: a CI-green feature branch ready for integration.

- [ ] **Step 1: Run the complete test suite**

Run: `pnpm test`

Expected: all tests pass.

- [ ] **Step 2: Run lint and TypeScript**

Run:

```bash
pnpm lint
pnpm typecheck
```

Expected: zero warnings/errors.

- [ ] **Step 3: Run production Vercel build**

Run: `pnpm build`

Expected: successful Next.js build and standalone preparation.

- [ ] **Step 4: Verify the GitHub Actions CI equivalent**

Push/commit the final feature branch state and wait for `.github/workflows/ci.yml` to complete. Confirm the workflow reports success for lint, typecheck, `build`, private order route contract, Vercel runtime smoke, critical commerce/security subset, and full tests.

- [ ] **Step 5: Review the branch diff against the spec**

Confirm:
- only intended storefront/search/test/docs files changed;
- no ProductDetailModal/FAQ/footer content regression;
- no new dependency;
- no extra visible storefront elements beyond the mockups/search interaction;
- Home still receives all published products from `app/page.tsx`.

- [ ] **Step 6: Finish branch**

Use the finishing-a-development-branch workflow and present integration options only after fresh successful verification.