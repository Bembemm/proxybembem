# Admin Product Catalog and Panel Redesign Design

**Date:** 2026-09-07  
**Branch:** `feat/admin-dashboard-expansion`

## Goal

Turn the product catalog into an admin-managed Supabase-backed system while preserving the existing checkout security model and current storefront behavior. At the same time, redesign the existing admin area around a sidebar layout inspired by the approved mockup, while keeping ProxyBembem's current violet/slate visual identity.

## Chosen approach

Supabase becomes the single source of truth for products.

The existing hardcoded catalog in `data/products.ts` is transitional only. Its two current products are migrated into Supabase with the same IDs and equivalent data before the storefront and checkout switch to database reads.

This avoids a split-brain catalog where storefront, cart, and checkout can disagree about title, price, publication state, or shipping metadata.

## Product lifecycle

Products use exactly three lifecycle states:

- `draft`: visible and editable in the admin, never visible or purchasable in the storefront.
- `published`: visible in the storefront and eligible for cart and checkout.
- `archived`: hidden from the storefront and ineligible for new purchases, but retained for historical integrity and possible reactivation.

There is no physical-delete flow in the admin. The user-facing action called "Remover" is implemented as archive/deactivate behavior.

Reactivation returns the product to `draft` by default. Publishing is always an explicit action.

## Existing product preservation

The migration must preserve the current products exactly enough that existing product references keep working:

- IDs `1` and `2` remain unchanged.
- Existing title, image reference, original price, discount/current price, tag, category, colors, featured flag, notice, highlights, description, details, sections, and shipping metadata are migrated.
- Existing cart storage can continue referencing products by ID.

The database sequence/identity must be advanced so newly created products do not reuse IDs `1` or `2`.

## Product data model

The `products` table is the authoritative catalog source.

At minimum it stores:

- `id`
- `status`
- `title`
- `category`
- `tag`
- `featured`
- `image_path`
- `original_price_cents`
- `price_cents`
- `description`
- `notice`
- `colors`
- `highlights`
- `details`
- `sections`
- `shipping_weight_kg`
- `shipping_length_cm`
- `shipping_width_cm`
- `shipping_height_cm`
- `display_order`
- `created_at`
- `updated_at`

Prices are stored as integer cents, not floating point values.

`colors`, `highlights`, `details`, and `sections` may use JSON/array storage internally, but the admin UI must expose normal form controls rather than raw JSON editing.

The database must enforce bounded, valid values for status, positive prices, and positive shipping dimensions. Application validation remains responsible for richer product-form constraints and friendly messages.

## Storefront and checkout behavior

Only `published` products are returned to public storefront consumers.

The cart continues persisting only stable product references and quantity. Product presentation and price are re-resolved against the current catalog rather than trusting stale browser data.

If a product price changes, a restored or refreshed cart uses the new current price.

If a product becomes archived or draft, it is no longer eligible for checkout. The cart should remove or mark unavailable lines during reconciliation and show a simple message such as "Um produto do seu carrinho não está mais disponível."

The checkout browser never becomes authoritative for price or shipping metadata. Checkout receives product IDs and quantities, then the server loads the current `published` product records and rebuilds:

- title
- unit price
- shipping weight
- shipping dimensions

An unavailable, draft, archived, or unknown product causes checkout to fail safely rather than falling back to stale product data.

## Order history integrity

Orders keep snapshots of purchase-time product information.

Editing or archiving a catalog product must not rewrite existing orders. Historical order views continue showing the title, quantity, and price captured when that order was created.

## Product image storage

Product images move to a dedicated Supabase Storage bucket, expected to be named `product-images`.

Images are publicly readable because they are storefront assets, but public users cannot upload, overwrite, or delete files.

Admin image flow:

1. Admin chooses a file from the local computer.
2. The application validates the active protected admin session.
3. The server authorizes or signs the upload target.
4. The browser uploads directly to Supabase Storage so image bytes do not need to transit through Vercel.
5. The new image reference is only attached to the product after the product save succeeds.
6. If upload or save fails, the previous active image remains unchanged.

Implementation should use unique immutable storage object names rather than overwriting an existing object in place, which avoids stale CDN/browser caches after an image replacement.

Old, unreferenced product images do not need automatic deletion in the first version. Safe orphan cleanup is explicitly deferred.

## Admin authorization

Every product-management mutation is protected by the existing admin security model.

Creating, editing, publishing, archiving, reactivating, and authorizing image uploads require the same active admin identity, MFA/AAL2, and server-side admin-session authorization already used by the protected admin pages.

No privileged Supabase service credential is exposed to the browser.

Public customers and normal authenticated customer accounts have no product mutation capability.

## Concurrency control

Product edits use optimistic concurrency so two admin tabs cannot silently overwrite one another.

An edit form loads the product's current `updated_at` value (or equivalent revision). Save/update operations include that revision as a precondition.

If another request changed the product first, the stale save is rejected with a clear message such as:

> Este produto foi alterado em outra sessão. Recarregue antes de salvar.

The stale form is never allowed to overwrite the newer product silently.

## Saving and publishing UX

There is no autosave.

The edit screen has explicit actions:

- **Salvar alterações**: persists form changes while keeping the current lifecycle state.
- **Publicar**: validates required storefront/checkout data, saves the product, and moves it to `published`.
- **Arquivar**: requires confirmation and moves the product to `archived` without deleting it.
- **Reativar**: moves an archived product to `draft`; publishing afterward remains explicit.

Unsaved edits trigger a navigation warning before the user leaves the page.

Validation errors identify the specific field or section that needs correction.

## Admin product list

A new protected route `/admin/produtos` displays the catalog management list.

Each row/card shows at least:

- image thumbnail
- product title
- lifecycle status
- current price
- category
- featured state
- last update
- edit action

The page includes:

- search by product name
- lifecycle filter for draft/published/archived
- **Novo produto** action

A new product starts as `draft`.

There is no numeric inventory/stock feature in this version. Availability is controlled solely by lifecycle state because the current products are made to order.

## Admin product editor

The product editor is divided into focused sections.

### Informações básicas

- name/title
- category
- tag/badge
- featured-home toggle
- optional colors

### Preços

- original/comparison price
- current/sale price

The form formats Brazilian currency for the admin while persisting integer cents.

### Imagem

- current image preview
- choose-file/upload control
- upload state and clear error handling

### Descrição e conteúdo

- main description
- notice
- repeatable highlights
- repeatable details (`label` + `value`)
- repeatable sections (`title` + paragraphs)

Repeatable content uses normal add/remove/reorder controls. Raw JSON is never required from the admin user.

### Frete e dimensões

This section is collapsed by default because changing it affects Melhor Envio quotation behavior.

Fields:

- weight in kilograms
- length in centimeters
- width in centimeters
- height in centimeters

All values must be valid and positive before publication.

### Publicação

Shows the current lifecycle state and the appropriate Save/Publish/Archive/Reactivate actions.

## Global admin redesign

The approved product mockup becomes the structural direction for the entire protected admin, not only the product section.

The existing ProxyBembem palette and styling remain: violet accents, white surfaces, slate/gray neutrals, rounded cards, subtle borders, and the current brand identity.

Desktop layout:

- fixed or sticky left sidebar
- primary content region on the right
- page title and description at the top
- page-specific primary actions aligned near the title
- consistent content cards and tables below

Sidebar navigation contains only currently supported areas plus Products:

- Visão geral
- Pedidos
- Produção
- Produtos
- Integrações
- Sair

The active route uses the existing violet emphasis.

Mobile behavior:

- sidebar becomes a dismissible/retractable navigation drawer
- content uses the full available width
- product and order data adapt to card/compact layouts where a wide table would be unusable
- no feature depends on browser zoom or permanent horizontal scrolling

The redesign must not alter the established admin login, MFA, session-expiry, logout, or cache-security semantics.

## Cache and freshness

The catalog must not serve stale price or lifecycle information after an admin mutation.

After successful create/update/publish/archive/reactivate operations, relevant Next.js cache entries are invalidated or the chosen catalog-read path is explicitly dynamic where needed.

Checkout always reads authoritative current data and does not rely on a long-lived public product cache for security-sensitive price or availability decisions.

Product image object names are immutable so image replacement does not depend on cache purging.

## Failure behavior

The system fails closed when authoritative product data is unavailable.

Storefront/catalog read failure:

- show a controlled temporary-unavailable state
- do not silently substitute hardcoded or stale product pricing

Checkout catalog failure:

- stop checkout
- show a safe retry message
- never create a payment preference from stale browser price data

Admin mutation failure:

- preserve the previous persisted product state
- show a clear error
- do not claim success

Image failure:

- preserve the previous active product image
- do not attach a partially uploaded/failed image reference

## Migration and rollout

Rollout is intentionally staged to reduce blast radius.

### Stage 1 — catalog foundation

- create database schema and constraints
- create Storage bucket/policies or equivalent secure upload authorization
- migrate products `1` and `2`
- add server catalog repository
- prove existing checkout can rebuild price and shipping metadata from Supabase
- verify the storefront can read published products from Supabase

The static catalog must remain untouched as a rollback aid until the Supabase-backed path passes automated and production acceptance. It must not remain as a runtime fallback once the cutover is accepted.

### Stage 2 — product administration

- add `/admin/produtos`
- add product editor/new-product flow
- add image upload
- add lifecycle actions
- add optimistic concurrency
- add cache invalidation

### Stage 3 — global admin layout

- replace the current top navigation structure with the approved sidebar shell
- migrate overview, orders, production, products, and integrations into the shared shell
- preserve all existing behavior and admin auth/cache contracts
- validate responsive/mobile behavior

Each stage requires automated verification before proceeding to the next stage.

## Testing requirements

Automated coverage must include at least:

- migration preserves product IDs `1` and `2`
- product IDs for new rows do not collide with migrated IDs
- only `published` products appear in public catalog reads
- `draft` and `archived` products cannot enter checkout
- checkout rebuilds current price from Supabase rather than browser input
- checkout rebuilds shipping metadata from Supabase
- product price update is reflected after cart reconciliation
- product archive makes an existing cart line unavailable
- historical order snapshots do not change after product edits
- admin-only product create/update/publish/archive/reactivate authorization
- non-admin mutation attempts fail
- image upload authorization requires protected admin access
- failed image save leaves previous image intact
- optimistic concurrency rejects a stale edit
- admin cache-control/no-store contracts remain intact
- new sidebar navigation highlights the correct section
- existing admin pages still require valid MFA/admin sessions
- mobile sidebar/navigation remains usable
- Vercel production build and startup smoke continue passing

Production acceptance should also cover at least one real admin edit of a safe test/draft product, publish/archive/reactivate transitions, image upload, a storefront visibility check, and a cart/checkout re-resolution check without completing a real paid Mercado Pago transaction.

## Explicitly out of scope

This first version does not add:

- numeric stock/inventory tracking
- physical product deletion from the admin
- automatic orphan-image garbage collection
- multi-admin roles or product-specific permissions
- product variants/SKUs
- scheduled publishing
- bulk product editing/import
- automatic price history UI

These can be added later without changing the chosen source-of-truth architecture.

## Success criteria

The feature is complete when the owner can create, edit, publish, archive, reactivate, and manage images for products entirely from the protected admin; the public storefront and checkout use Supabase as the only runtime catalog authority; existing products retain their IDs and behavior; historical orders remain intact; and all current admin pages use the approved sidebar structure without regressing authentication, MFA, caching, production operation, or mobile usability.
