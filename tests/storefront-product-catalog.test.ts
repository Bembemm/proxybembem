import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

test("public storefront components receive products and never import the static runtime catalog", () => {
  const productsPage = source("components/pages/products-page.tsx")
  const homePage = source("components/pages/home-page.tsx")

  assert.doesNotMatch(productsPage, /@\/data\/products/)
  assert.doesNotMatch(homePage, /@\/data\/products/)
  assert.match(productsPage, /ProductsPage\s*\(\s*\{\s*products/)
  assert.match(homePage, /HomePage\s*\(\s*\{\s*featuredProducts/)
})

test("storefront routes load published products from the server repository with no static fallback", () => {
  const productsRoute = source("app/produtos/page.tsx")
  const homeRoute = source("app/page.tsx")

  for (const route of [productsRoute, homeRoute]) {
    assert.match(route, /listPublishedProducts/)
    assert.doesNotMatch(route, /@\/data\/products/)
  }

  assert.match(productsRoute, /await\s+listPublishedProducts\s*\(/)
  assert.match(productsRoute, /<ProductsPage\s+products=/)
  assert.match(homeRoute, /await\s+listPublishedProducts\s*\(/)
  assert.match(homeRoute, /\.filter\s*\(.*featured/s)
  assert.match(homeRoute, /<HomePage\s+featuredProducts=/)
})

test("catalog repository failure renders a controlled storefront unavailable state", () => {
  const productsRoute = source("app/produtos/page.tsx")
  const homeRoute = source("app/page.tsx")
  const productsPage = source("components/pages/products-page.tsx")
  const homePage = source("components/pages/home-page.tsx")

  assert.match(productsRoute, /catch\s*\{/)
  assert.match(productsRoute, /unavailable/)
  assert.match(homeRoute, /catch\s*\{/)
  assert.match(homeRoute, /unavailable/)
  assert.match(productsPage, /Catálogo temporariamente indisponível/)
  assert.match(homePage, /Catálogo temporariamente indisponível/)
})

test("GET api catalog exposes only the current published public product shape and fails closed", () => {
  const routePath = new URL("../app/api/catalog/route.ts", import.meta.url)
  assert.equal(existsSync(routePath), true, "catalog API route must exist")

  const route = readFileSync(routePath, "utf8")
  assert.match(route, /export\s+async\s+function\s+GET/)
  assert.match(route, /listPublishedProducts/)
  assert.match(route, /toPublicProduct/)
  assert.match(route, /catalog_unavailable/)
  assert.match(route, /status:\s*503/)
  assert.doesNotMatch(route, /@\/data\/products/)
  assert.doesNotMatch(route, /supabaseSecretKey|SUPABASE_SECRET_KEY/)
})
