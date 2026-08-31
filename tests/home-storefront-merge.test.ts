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

test("home storefront renders the complete trusted product catalog in a products section", () => {
  const home = source("components/pages/home-page.tsx")

  assert.match(home, /import\s*\{\s*products\s*\}\s*from\s*["']@\/data\/products["']/)
  assert.doesNotMatch(home, /featuredProducts/)
  assert.match(home, /id=["']produtos["']/)
  assert.match(home, /products\.map\s*\(/)
})

test("Produtos navigation points directly to the home storefront section", () => {
  const navbar = source("components/navbar.tsx")

  assert.match(navbar, /label:\s*["']Produtos["']\s*,\s*href:\s*["']\/#produtos["']/)
})

test("legacy /produtos route redirects to the home storefront section", () => {
  const route = source("app/produtos/page.tsx")

  assert.match(route, /from\s*["']next\/navigation["']/)
  assert.match(route, /redirect\s*\(\s*["']\/#produtos["']\s*\)/)
  assert.doesNotMatch(route, /<ProductsPage\s*\/>/)
})
