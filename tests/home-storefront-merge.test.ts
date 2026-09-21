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
  assert.match(home, /products\.map\s*\(/)
  assert.match(home, /HomeHighlightsCarousel/)
})

test("home uses a dedicated highlight card while products keep the shared storefront card", () => {
  const home = source("components/pages/home-page.tsx")
  const products = source("components/pages/products-page.tsx")
  const highlight = source("components/home-highlight-product-card.tsx")
  const card = source("components/storefront-product-card.tsx")
  const addButton = source("components/add-to-cart-button.tsx")

  assert.match(home, /HomeHighlightProductCard/)
  assert.doesNotMatch(home, /StorefrontProductCard/)
  assert.match(products, /StorefrontProductCard/)
  assert.match(card, /product\.tag/)
  assert.match(highlight, /product\.image/)
  assert.match(highlight, /product\.title/)
  assert.match(highlight, /product\.originalPrice/)
  assert.match(highlight, /product\.discountPrice/)
  assert.match(highlight, /discountPercent/)
  assert.match(highlight, /% OFF/)
  assert.doesNotMatch(highlight, /AddToCartButton/)
  assert.match(highlight, /Ver produto/)
  assert.match(highlight, /ArrowRight/)
  assert.match(highlight, /Eye/)
  assert.match(highlight, /w-\[92%\]/)
  assert.match(highlight, /grid-cols-\[44%_minmax\(0,1fr\)\]/)
  assert.match(highlight, /font-serif/)
  assert.match(highlight, /text-\[17px\]/)
  assert.match(highlight, /text-\[23px\]/)
  assert.match(highlight, /lg:min-h-\[2\.75rem\]/)
  assert.match(highlight, /lg:mt-1\.5/)
  assert.match(highlight, /lg:pt-4/)
  assert.doesNotMatch(highlight, /Pix/i)
  assert.doesNotMatch(highlight, /sem juros/i)
  assert.match(addButton, /label = "Adicionar"/)
  assert.match(addButton, /addToCart\(product\)/)
  assert.match(highlight, /productHref\(product\)/)
})

test("home keeps every product rendered in the responsive paged carousel", () => {
  const home = source("components/pages/home-page.tsx")
  const carousel = source("components/home-highlights-carousel.tsx")

  assert.doesNotMatch(home, /@\/data\/products/)
  assert.match(home, />\s*Destaques\s*</)
  assert.match(home, /href=["']\/produtos["']/)
  assert.match(home, /Ver todos/)
  assert.match(home, /font-serif/)
  assert.match(home, /HomeHighlightsCarousel/)
  assert.match(home, /HomeHighlightProductCard/)
  assert.match(home, /products\.map\(\(product, index\)/)
  assert.match(home, /priority=\{index === 0\}/)

  assert.match(carousel, /useRef/)
  assert.match(carousel, /useEffect/)
  assert.match(carousel, /ArrowLeft/)
  assert.match(carousel, /ArrowRight/)
  assert.match(carousel, /itemsPerPage/)
  assert.match(carousel, /innerWidth\s*>=\s*1024\s*\?\s*4/)
  assert.match(carousel, /innerWidth\s*>=\s*640\s*\?\s*2\s*:\s*1/)
  assert.match(carousel, /Math\.ceil\(items\.length\s*\/\s*itemsPerPage\)/)
  assert.match(carousel, /items\.map\(\(item, itemIndex\)/)
  assert.doesNotMatch(carousel, /items\.slice\(/)
  assert.doesNotMatch(carousel, /activeMobileItem/)
  assert.match(carousel, /w-full shrink-0 px-2 sm:w-1\/2 lg:w-1\/4/)
  assert.match(carousel, /carousel\.scrollWidth - carousel\.clientWidth/)
  assert.match(carousel, /\[scrollbar-width:none\]/)
  assert.match(carousel, /\[&::\-webkit-scrollbar\]:hidden/)
  assert.match(carousel, /aria-label=\{`Ir para página \$\{pageIndex \+ 1\}`\}/)
  assert.match(carousel, /aria-label=["']Produtos em destaque["']/)
  assert.match(home, /max-w-\[1180px\]/)
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
  assert.doesNotMatch(navbar, /fetch\(["']\/api\/catalog["']/)
  assert.match(navbar, /catalogProducts/)
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

test("dedicated ProductsPage renders server cards while ProductsBrowser owns category and search interaction", () => {
  const route = source("app/produtos/page.tsx")
  const page = source("components/pages/products-page.tsx")
  const browser = source("components/products-browser.tsx")

  assert.match(browser, /useState<string\[\]>\(\s*initialCategory \? \[initialCategory\] : \[\]/)
  assert.match(
    route,
    /key=\{`\$\{initialCategory \?\? ["']all-products["']\}:\$\{initialSearch \?\? ["']all-search["']\}`\}/,
  )
  assert.match(route, /initialCategory=\{initialCategory\}/)
  assert.match(route, /initialSearch=\{initialSearch\}/)
  assert.match(page, /StorefrontProductCard/)
  assert.match(page, /ProductsBrowser/)
  assert.match(browser, /filteredEntries\.map\s*\(/)
  assert.doesNotMatch(page, /ProductDetailModal/)
})

test("/produtos accepts a bounded busca query and passes it to ProductsPage", () => {
  const route = source("app/produtos/page.tsx")

  assert.match(route, /busca/)
  assert.match(route, /slice\(0,\s*100\)/)
  assert.match(route, /initialSearch=/)
})

test("ProductsBrowser combines normalized text search with selected categories", () => {
  const browser = source("components/products-browser.tsx")

  assert.match(browser, /initialSearch\?: string/)
  assert.match(browser, /normalizeSearch/)
  assert.match(browser, /entry\.title/)
  assert.match(browser, /entry\.category/)
  assert.match(browser, /matchesSearch/)
  assert.match(browser, /matchesCategory/)
  assert.match(browser, /matchesSearch\s*&&\s*matchesCategory/)
})
