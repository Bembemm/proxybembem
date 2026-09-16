import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

test("home uses a centered horizontal featured carousel with side arrows instead of a static grid", () => {
  const home = source("components/pages/home-page.tsx")

  assert.doesNotMatch(home, /@\/data\/products/)
  assert.match(home, /HomePage\s*\(\s*\{\s*featuredProducts/)
  assert.match(home, /featuredProducts\.map\s*\(/)
  assert.match(home, />\s*Destaques\s*</)
  assert.doesNotMatch(home, /Monte seu deck do seu jeito/)
  assert.doesNotMatch(home, /Escolha a quantidade de cartas/)
  assert.match(home, /useRef/)
  assert.match(home, /ChevronLeft/)
  assert.match(home, /ChevronRight/)
  assert.match(home, /scrollBy\s*\(/)
  assert.match(home, /overflow-x-auto/)
  assert.match(home, /snap-x/)
  assert.match(home, /max-w-\[1380px\]/)
  assert.match(home, /aria-label=["']Produtos em destaque["']/)
})

test("navbar exposes only a dynamic Categorias storefront menu alongside account and cart icons", () => {
  const navbar = source("components/navbar.tsx")

  assert.match(navbar, /Categorias/)
  assert.match(navbar, /fetch\(["']\/api\/catalog["']/)
  assert.match(navbar, /product\.category/)
  assert.match(navbar, /\/produtos\?categoria=/)
  assert.doesNotMatch(navbar, /label:\s*["']Produtos["']/)
  assert.doesNotMatch(navbar, /label:\s*["']Contato["']/)
  assert.match(navbar, /UserRound/)
  assert.match(navbar, /ShoppingCart/)
})

test("/produtos validates the categoria query against the published catalog before passing it to ProductsPage", () => {
  const route = source("app/produtos/page.tsx")

  assert.match(route, /searchParams/)
  assert.match(route, /await\s+searchParams/)
  assert.match(route, /categoria/)
  assert.match(route, /products\.some\s*\(/)
  assert.match(route, /initialCategory=/)
  assert.match(route, /<ProductsPage/)
})

test("dedicated ProductsPage applies and resynchronizes the category received from the URL", () => {
  const page = source("components/pages/products-page.tsx")

  assert.match(page, /initialCategory/)
  assert.match(page, /useEffect/)
  assert.match(page, /setSelectedCategories/)
  assert.match(page, /filteredProducts\.map\s*\(/)
  assert.match(page, /ProductDetailModal/)
})
