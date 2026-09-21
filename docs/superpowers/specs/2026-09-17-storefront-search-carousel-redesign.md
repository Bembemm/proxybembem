# Storefront Search + Home Carousel Redesign

Date: 2026-09-17

## Goal

Recreate the approved storefront visuals from the two provided mockups without adding or removing visible storefront elements beyond what is represented there. The change covers the public header, real product search, and the Home `Destaques` section. Existing FAQ, footer, cart behavior, account flow, product detail modal, catalog source, admin-managed product data, and category filtering remain intact unless explicitly required for integration.

## Header

### Desktop
- White two-row header matching the approved mockup.
- First row: ProxyBembem brand at left, centered search field, then `Contato`, account icon, and cart icon with the existing purple quantity badge.
- Search placeholder: `Buscar produtos, decks, acessórios...`.
- Second row: `Categorias`, `Início`, and `Produtos`.
- Preserve existing category data from `/api/catalog`, account detection, cart opening behavior, active route treatment, and category links.

### Mobile
- One compact row matching the approved mockup: hamburger on the left, ProxyBembem brand centered, search icon and cart on the right.
- Account/contact remain accessible from the existing mobile menu rather than introducing extra visible controls not shown in the mockup.
- Tapping the search icon exposes a compact search input; normal resting header remains visually identical to the mockup.

## Search behavior

- Search uses the existing public product catalog; no new search backend is required.
- Submitting from the header navigates to `/produtos?busca=<query>`.
- The Products route accepts `busca` in addition to the existing `categoria` parameter.
- Products Page filters published products client-side by a normalized case-insensitive query over product title and category.
- Search and category filters combine with AND semantics: a product must match the query and selected category filters.
- Empty search behaves as no search filter.
- Result count and existing empty-state messaging reflect the combined filters.

## Home `Destaques`

- Replace the current single-large-card presentation with cards visually aligned to the existing Products Page card design and the approved mockups.
- Keep the Home section heading `Destaques` and add `Ver todos →` linking to `/produtos`, positioned as shown in the mockups.
- Show all products supplied to Home in a horizontal carousel.
- Preserve product tag rendering, image, title, original price, discounted price, `Adicionar`, and `Ver Detalhes`.
- Reuse the existing product detail modal and cart behavior.

### Desktop carousel
- Multiple product cards visible at once, sized smaller than the current Home highlight card.
- Cards retain the same visual language as Products Page: white translucent/light card, rounded corners, image above, tag over image, title, original and discounted price, outlined purple add button, and `Ver Detalhes` row.
- Left/right circular navigation arrows sit at the carousel edges.
- Pagination dots appear below the carousel.
- Horizontal overflow is clipped so the final visible card can suggest more content at the edge, matching the mockup.

### Mobile carousel
- One primary card visible with part of the next card peeking in from the right, matching the approved mockup.
- Swipe/drag horizontal scrolling remains available.
- Left/right circular arrows remain visible where applicable.
- Pagination dots remain below.
- Card proportions, spacing, typography, tag, add button, and details link follow the mobile mockup.

## Reuse and consistency

- Prefer extracting/reusing shared card presentation logic between Home and Products Page rather than maintaining two visually divergent implementations.
- Do not duplicate product copy or hardcode catalog values that are already admin-managed.
- Do not alter the recently redesigned `ProductDetailModal` visual or behavior.
- Do not change FAQ content or footer content; only retain their current placement beneath the newly resized Home carousel.

## Files expected to change

- `components/navbar.tsx`
- `components/pages/home-page.tsx`
- `components/pages/products-page.tsx`
- `app/produtos/page.tsx`
- likely a new reusable storefront product-card component under `components/`
- tests covering Home storefront structure, navbar/search behavior, products query filtering, and card reuse

## Validation

Implementation must be test-driven and finish with the repository's complete CI-equivalent validation, including:
- lint
- TypeScript typecheck
- Vercel build
- private order route contract / startup smoke checks already present in CI
- critical commerce/security subset
- full test suite

## Acceptance criteria

1. Desktop Home matches the approved desktop mockup structure: redesigned two-row header with search, smaller multi-card `Destaques` carousel, arrows, pagination dots, and `Ver todos →`.
2. Mobile Home matches the approved mobile mockup structure: hamburger + centered brand + search/cart header, one card with next-card peek, arrows, dots, `Adicionar`, and `Ver Detalhes`.
3. Header search is functional and lands on Products Page with the query preserved in the URL.
4. Products Page search combines correctly with existing category filters.
5. Existing account, cart, category menu, modal, FAQ, footer, admin-driven catalog data, and checkout-related behavior continue to work.
6. No extra visible storefront section, button, text block, or decorative feature is introduced beyond the approved mockups and required search interaction.
