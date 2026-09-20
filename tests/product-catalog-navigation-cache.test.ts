import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

const REVALIDATION = new URL(
  "../lib/server/product-catalog-revalidation.ts",
  import.meta.url,
)
const PRODUCT_ROUTE = new URL("../app/api/admin/products/route.ts", import.meta.url)
const PRODUCT_UPDATE_ROUTE = new URL(
  "../app/api/admin/products/[id]/route.ts",
  import.meta.url,
)
const PRODUCT_LIFECYCLE_ROUTE = new URL(
  "../app/api/admin/products/[id]/publish/route.ts",
  import.meta.url,
)
const NAVBAR = new URL("../components/navbar.tsx", import.meta.url)

test("public catalog invalidation covers home and product destinations", () => {
  assert.equal(
    existsSync(REVALIDATION),
    true,
    "public product catalog invalidation module must exist",
  )
  const source = readFileSync(REVALIDATION, "utf8")
  assert.match(source, /from\s+["']next\/cache["']/)
  assert.match(source, /invalidatePublicProductCatalog/)
  assert.match(source, /revalidateTag\(\s*["']product-catalog["']/)
  assert.match(source, /revalidatePath\(\s*["']\/["']\s*\)/)
  assert.match(source, /revalidatePath\(\s*["']\/produtos["']\s*\)/)
  assert.match(source, /revalidatePath\(\s*["']\/produtos\/\[produto\]["']\s*,\s*["']page["']\s*\)/)
})

test("admin product routes wire cache invalidation on the server", () => {
  for (const route of [PRODUCT_ROUTE, PRODUCT_UPDATE_ROUTE, PRODUCT_LIFECYCLE_ROUTE]) {
    const source = readFileSync(route, "utf8")
    assert.match(source, /invalidatePublicProductCatalog/)
    assert.match(source, /createAdminProductRouteHandlers/)
  }
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
