import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

test("home sends every published product to the storefront without a featured-only filter", () => {
  const route = source("app/page.tsx")
  const home = source("components/pages/home-page.tsx")

  assert.doesNotMatch(route, /featuredProducts\s*=\s*products\.filter/)
  assert.match(route, /<HomePage\s+products=\{products\}/)
  assert.match(home, /HomePage\s*\(\s*\{\s*products/)
  assert.match(home, /products\.slice\s*\(/)
})

test("home and products share one storefront product-card presentation", () => {
  const home = source("components/pages/home-page.tsx")
  const products = source("components/pages/products-page.tsx")
  const card = source("components/storefront-product-card.tsx")

  assert.match(home, /StorefrontProductCard/)
  assert.match(products, /StorefrontProductCard/)
  assert.match(card, /product\.tag/)
  assert.match(card, /product\.image/)
  assert.match(card, /product\.title/)
  assert.match(card, /product\.originalPrice/)
  assert.match(card, /product\.discountPrice/)
  assert.match(card, /Adicionar/)
  assert.match(card, /Ver Detalhes/)
  assert.match(card, /addToCart\(product\)/)
  assert.match(card, /productHref\(product\)/)
})

test("home carousel paginates highlights by viewport: 1 mobile, 2 tablet, 4 desktop", () => {
  const home = source("components/pages/home-page.tsx")

  assert.doesNotMatch(home, /@\/data\/products/)
  assert.match(home, />\s*Destaques\s*</)
  assert.match(home, /href=["']\/produtos["']/)
  assert.match(home, /Ver todos/)
  assert.match(home, /useRef/)
  assert.match(home, /useEffect/)
  assert.match(home, /ArrowLeft/)
  assert.match(home, /ArrowRight/)
  assert.match(home, /itemsPerPage/)
  assert.match(home, /innerWidth\s*>=\s*1024\s*\?\s*4/)
  assert.match(home, /innerWidth\s*>=\s*640\s*\?\s*2\s*:\s*1/)
  assert.match(home, /Math\.ceil\(products\.length\s*\/\s*itemsPerPage\)/)
  assert.match(home, /data-carousel-page/)
  assert.match(home, /slice\(pageIndex \* itemsPerPage/)
  assert.match(home, /grid-cols-1/)
  assert.match(home, /sm:grid-cols-2/)
  assert.match(home, /lg:grid-cols-4/)
  assert.match(home, /pages\.map\s*\(\(page, pageIndex\)/)
  assert.match(home, /scrollToPage\(activePage \+ direction\)/)
  assert.match(home, /aria-label=\{\`Ir para página \$\{pageIndex \+ 1\}\`\}/)
  assert.doesNotMatch(home, /aria-label=\{\`Ir para produto/)
  assert.match(home, /max-w-\[1180px\]/)
  assert.match(home, /aria-label=["']Produtos em destaque["']/)
  assert.match(home, /StorefrontProductCard/)
})

test("home, notice and FAQ use one compact vertical rhythm without artificial header offsets", () => {
  const home = source("components/pages/home-page.tsx")
  const faq = source("components/faq-section.tsx")
  const notice = source("components/store-notice.tsx")

  assert.doesNotMatch(home, /min-h-\[70vh\]/)
  assert.match(home, /pt-6/)
  assert.match(home, /lg:pt-8/)
  assert.match(home, /pb-10/)
  assert.match(home, /lg:pb-12/)
  assert.match(faq, /pt-6/)
  assert.match(faq, /sm:pt-8/)
  assert.match(faq, /pb-10/)
  assert.match(faq, /sm:pb-12/)
  assert.doesNotMatch(notice, /top-16/)
  assert.doesNotMatch(notice, /md:top-24/)
  assert.match(notice, /max-w-\[1180px\]/)
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

test("dedicated ProductsPage applies and resynchronizes category and search received from the URL", () => {
  const route = source("app/produtos/page.tsx")
  const page = source("components/pages/products-page.tsx")

  assert.match(page, /useState<string\[\]>\(\s*initialCategory \? \[initialCategory\] : \[\]/)
  assert.match(
    route,
    /key=\{`\$\{initialCategory \?\? ["']all-products["']\}:\$\{initialSearch \?\? ["']all-search["']\}`\}/,
  )
  assert.match(route, /initialCategory=\{initialCategory\}/)
  assert.match(route, /initialSearch=\{initialSearch\}/)
  assert.doesNotMatch(page, /setSelectedCategories\(initialCategory \? \[initialCategory\] : \[\]\)/)
  assert.match(page, /filteredProducts\.map\s*\(/)
  assert.match(page, /StorefrontProductCard/)
  assert.doesNotMatch(page, /ProductDetailModal/)
})

test("/produtos accepts a bounded busca query and passes it to ProductsPage", () => {
  const route = source("app/produtos/page.tsx")

  assert.match(route, /busca/)
  assert.match(route, /slice\(0,\s*100\)/)
  assert.match(route, /initialSearch=/)
})

test("ProductsPage combines normalized text search with selected categories", () => {
  const page = source("components/pages/products-page.tsx")

  assert.match(page, /initialSearch\?: string/)
  assert.match(page, /normalizeSearch/)
  assert.match(page, /product\.title/)
  assert.match(page, /product\.category/)
  assert.match(page, /matchesSearch/)
  assert.match(page, /matchesCategory/)
  assert.match(page, /matchesSearch\s*&&\s*matchesCategory/)
})
