import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { products } from "../data/products.ts"

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

test("rollback catalog preserves the current 60-card public prices", () => {
  const product = products.find((candidate) => candidate.id === 2)

  assert.ok(product)
  assert.equal(product.originalPrice, 99.99)
  assert.equal(product.discountPrice, 69.99)
})

test("home receives a featured-products preview instead of importing the full catalog", () => {
  const home = source("components/pages/home-page.tsx")

  assert.doesNotMatch(home, /@\/data\/products/)
  assert.match(home, /HomePage\s*\(\s*\{\s*featuredProducts/)
  assert.doesNotMatch(home, /id=["']produtos["']/)
  assert.match(home, /featuredProducts\.map\s*\(/)
  assert.match(home, /href=["']\/produtos["']/)
  assert.match(home, />\s*Ver Todos os Produtos\s*</)
})

test("Produtos navigation points to the dedicated products page", () => {
  const navbar = source("components/navbar.tsx")

  assert.match(navbar, /label:\s*["']Produtos["']\s*,\s*href:\s*["']\/produtos["']/)
  assert.doesNotMatch(navbar, /href:\s*["']\/#produtos["']/)
})

test("/produtos loads the published catalog and renders the dedicated ProductsPage", () => {
  const route = source("app/produtos/page.tsx")

  assert.match(route, /import\s*\{\s*ProductsPage\s*\}\s*from\s*["']@\/components\/pages\/products-page["']/)
  assert.match(route, /listPublishedProducts/)
  assert.match(route, /<ProductsPage\s+products=/)
  assert.doesNotMatch(route, /redirect\s*\(/)
})

test("dedicated ProductsPage keeps catalog filters over the supplied product list", () => {
  const page = source("components/pages/products-page.tsx")

  assert.match(page, /ProductsPage\s*\(\s*\{\s*products/)
  assert.match(page, /Filtros/)
  assert.match(page, /filteredProducts\.map\s*\(/)
  assert.match(page, /ProductDetailModal/)
})
