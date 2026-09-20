import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const CACHE = new URL("../lib/server/product-catalog-cache.ts", import.meta.url)
const ACTIONS = new URL("../lib/server/admin-product-actions.ts", import.meta.url)
const PRODUCT_FORM = new URL(
  "../components/admin/products/product-form.tsx",
  import.meta.url,
)
const LIFECYCLE_ACTIONS = new URL(
  "../components/admin/products/product-lifecycle-actions.tsx",
  import.meta.url,
)
const NAVBAR = new URL("../components/navbar.tsx", import.meta.url)

const ROUTES = [
  "../app/api/admin/products/route.ts",
  "../app/api/admin/products/[id]/route.ts",
  "../app/api/admin/products/[id]/publish/route.ts",
  "../app/api/admin/products/[id]/archive/route.ts",
  "../app/api/admin/products/[id]/reactivate/route.ts",
] as const

test("public catalog cache owns immediate tag and route invalidation", () => {
  const source = readFileSync(CACHE, "utf8")
  assert.match(source, /unstable_cache/)
  assert.match(source, /revalidateTag\(\s*["']product-catalog["']/)
  assert.match(source, /revalidatePath\(\s*["']\/["']\s*\)/)
  assert.match(source, /revalidatePath\(\s*["']\/produtos["']\s*\)/)
  assert.match(
    source,
    /revalidatePath\(\s*["']\/produtos\/\[produto\]["']\s*,\s*["']page["']\s*\)/,
  )
})

test("successful admin product mutations invalidate from the server write flow", () => {
  const actions = readFileSync(ACTIONS, "utf8")
  assert.match(actions, /invalidateCatalogAfterMutation/)
  assert.match(
    actions,
    /createDraftProduct[\s\S]*invalidateCatalogAfterMutation\(deps\)/,
  )
  assert.match(
    actions,
    /updateProduct[\s\S]*invalidateCatalogAfterMutation\(deps\)/,
  )
  assert.match(
    actions,
    /\[\x60\$\{operation\}Product\x60\][\s\S]*invalidateCatalogAfterMutation\(deps\)/,
  )

  for (const relativePath of ROUTES) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8")
    assert.match(source, /invalidatePublishedProductCatalog/)
    assert.match(
      source,
      /invalidatePublicProductCatalog:\s*invalidatePublishedProductCatalog/,
    )
  }
})

test("admin browser no longer performs a second post-save cache mutation", () => {
  const formSource = readFileSync(PRODUCT_FORM, "utf8")
  const lifecycleSource = readFileSync(LIFECYCLE_ACTIONS, "utf8")

  assert.doesNotMatch(formSource, /revalidatePublicProductCatalog|product-catalog-revalidation/)
  assert.doesNotMatch(lifecycleSource, /revalidatePublicProductCatalog|product-catalog-revalidation/)
})

test("mutable storefront destinations bypass soft navigation that can reuse stale RSC payloads", () => {
  const source = readFileSync(NAVBAR, "utf8")

  assert.doesNotMatch(source, /label:\s*["']Início["']/)
  assert.match(
    source,
    /<a\s+[^>]*href=["']\/["'][^>]*aria-label=["']ProxyBembem - Início["'][^>]*>/,
  )
  assert.match(source, /href=\{`\/produtos\?categoria=\$\{encodeURIComponent\(category\)\}`\}/)
  assert.doesNotMatch(
    source,
    /<Link\b[^>]*href=\{`\/produtos\?categoria=\$\{encodeURIComponent\(category\)\}`\}[^>]*>/,
  )

  const hardProductsLinks = source.match(/<a\s+[\s\S]*?href=["']\/produtos["'][\s\S]*?>/g) ?? []
  assert.ok(
    hardProductsLinks.length >= 2,
    "desktop and mobile Produtos navigation must force a fresh document request",
  )
  assert.doesNotMatch(
    source,
    /<Link\b[^>]*href=["']\/produtos["'][^>]*>/,
    "Produtos navigation must not reuse a stale client Router Cache payload",
  )
})
