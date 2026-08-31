import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { products } from "../data/products.ts"

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

test("60-card deck advertises R$ 99,99 original price and R$ 69,99 sale price", () => {
  const product = products.find((candidate) => candidate.id === 2)

  assert.ok(product)
  assert.equal(product.originalPrice, 99.99)
  assert.equal(product.discountPrice, 69.99)
})

test("home returns to a featured-products preview instead of rendering the full catalog", () => {
  const home = source("components/pages/home-page.tsx")

  assert.match(home, /import\s*\{\s*featuredProducts\s*\}\s*from\s*["']@\/data\/products["']/)
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

test("/produtos renders the dedicated ProductsPage instead of redirecting home", () => {
  const route = source("app/produtos/page.tsx")

  assert.match(route, /import\s*\{\s*ProductsPage\s*\}\s*from\s*["']@\/components\/pages\/products-page["']/)
  assert.match(route, /return\s*<ProductsPage\s*\/>/)
  assert.doesNotMatch(route, /redirect\s*\(/)
})

test("dedicated ProductsPage keeps catalog filters and the full product list", () => {
  const page = source("components/pages/products-page.tsx")

  assert.match(page, /Filtros/)
  assert.match(page, /filteredProducts\.map\s*\(/)
  assert.match(page, /ProductDetailModal/)
})
