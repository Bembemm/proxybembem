import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

test("public storefront uses a lightweight cached product summary instead of full catalog rows", () => {
  const catalog = source("lib/server/product-catalog.ts")
  const cachePath = new URL("../lib/server/product-catalog-cache.ts", import.meta.url)

  assert.equal(existsSync(cachePath), true, "public catalog cache module must exist")

  const cache = readFileSync(cachePath, "utf8")

  assert.match(catalog, /PUBLIC_PRODUCT_SUMMARY_SELECT/)
  assert.match(catalog, /listPublishedProductSummaries/)
  assert.doesNotMatch(
    catalog.match(/const PUBLIC_PRODUCT_SUMMARY_SELECT[\s\S]*?\.join\(","\)/)?.[0] ?? "",
    /description|notice|highlights|details|sections|shipping_/,
  )

  assert.match(cache, /unstable_cache/)
  assert.match(cache, /listPublishedProductSummaries/)
  assert.match(cache, /revalidate:\s*60/)
  assert.match(cache, /tags:\s*\[["']product-catalog["']\]/)
  assert.match(cache, /getPublishedProductSummaries/)
})

test("home, products and public catalog endpoint consume the lightweight cached catalog", () => {
  const homeRoute = source("app/page.tsx")
  const productsRoute = source("app/produtos/page.tsx")
  const api = source("app/api/catalog/route.ts")

  for (const route of [homeRoute, productsRoute, api]) {
    assert.match(route, /getPublishedProductSummaries/)
    assert.doesNotMatch(route, /listPublishedProducts/)
  }

  assert.doesNotMatch(api, /description|highlights|details|sections|shipping/)
})

test("navbar reuses the cart provider catalog so the browser performs only one catalog fetch", () => {
  const navbar = source("components/navbar.tsx")
  const cart = source("contexts/cart-context.tsx")

  assert.doesNotMatch(navbar, /fetch\(["']\/api\/catalog["']/)
  assert.match(navbar, /catalogProducts/)
  assert.match(navbar, /useCart\(\)/)

  const clientCatalogFetches = cart.match(/fetch\(["']\/api\/catalog["']/g) ?? []
  assert.equal(clientCatalogFetches.length, 1)
  assert.match(cart, /catalogProducts:\s*StorefrontProduct\[\]/)
  assert.match(cart, /setCatalogProducts/)
})

test("product mutation invalidation expires the lightweight catalog cache immediately", () => {
  const revalidation = source("lib/server/product-catalog-revalidation.ts")

  assert.match(revalidation, /revalidateTag/)
  assert.match(
    revalidation,
    /revalidateTag\(\s*["']product-catalog["']\s*,\s*\{\s*expire:\s*0\s*\}\s*\)/,
  )
})

test("cart panel javascript is lazy-loaded only when the cart is opened", () => {
  const shell = source("components/site-shell.tsx")
  const shellRouter = source("components/site-shell-router.tsx")
  const lazyCartPath = new URL("../components/lazy-cart-panel.tsx", import.meta.url)

  assert.equal(existsSync(lazyCartPath), true, "lazy cart boundary must exist")
  const lazyCart = readFileSync(lazyCartPath, "utf8")

  assert.doesNotMatch(shell, /import\s+\{\s*CartPanel\s*\}/)
  assert.match(shell, /SiteShellRouter/)
  assert.match(shellRouter, /LazyCartPanel/)
  assert.match(lazyCart, /dynamic\s*\(/)
  assert.match(lazyCart, /isCartOpen\s*\?\s*<CartPanel/)
})
