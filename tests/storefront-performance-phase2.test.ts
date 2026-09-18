import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

test("root layout resolves CSP request context and cached public settings in parallel", () => {
  const layout = source("app/layout.tsx")

  assert.match(layout, /Promise\.all\s*\(/)
  assert.match(layout, /headers\(\)/)
  assert.match(layout, /getPublicStoreSettings\(\)/)
})

test("storefront cards keep only the cart button interactive", () => {
  const card = source("components/storefront-product-card.tsx")
  const addButtonPath = new URL("../components/add-to-cart-button.tsx", import.meta.url)

  assert.equal(existsSync(addButtonPath), true, "client add-to-cart island must exist")
  const addButton = readFileSync(addButtonPath, "utf8")

  assert.doesNotMatch(card, /^["']use client["']/m)
  assert.doesNotMatch(card, /useState|useCart/)
  assert.match(card, /AddToCartButton/)
  assert.match(addButton, /^["']use client["']/m)
  assert.match(addButton, /useCart/)
  assert.match(addButton, /addToCart\(product\)/)
})

test("home and products render server cards through small client interaction shells", () => {
  const home = source("components/pages/home-page.tsx")
  const products = source("components/pages/products-page.tsx")
  const homeCarouselPath = new URL("../components/home-highlights-carousel.tsx", import.meta.url)
  const productsBrowserPath = new URL("../components/products-browser.tsx", import.meta.url)

  assert.equal(existsSync(homeCarouselPath), true)
  assert.equal(existsSync(productsBrowserPath), true)

  const carousel = readFileSync(homeCarouselPath, "utf8")
  const browser = readFileSync(productsBrowserPath, "utf8")

  assert.doesNotMatch(home, /^["']use client["']/m)
  assert.doesNotMatch(products, /^["']use client["']/m)
  assert.match(home, /HomeHighlightsCarousel/)
  assert.match(products, /ProductsBrowser/)
  assert.match(home, /StorefrontProductCard/)
  assert.match(products, /StorefrontProductCard/)
  assert.match(carousel, /^["']use client["']/m)
  assert.match(browser, /^["']use client["']/m)
  assert.match(carousel, /children/)
  assert.match(browser, /card:\s*ReactNode/)
})

test("individual product page hydrates only purchase controls so related cards stay server rendered", () => {
  const page = source("components/product-page.tsx")
  const actionsPath = new URL("../components/product-purchase-actions.tsx", import.meta.url)

  assert.equal(existsSync(actionsPath), true, "product purchase interaction island must exist")
  const actions = readFileSync(actionsPath, "utf8")

  assert.doesNotMatch(page, /^["']use client["']/m)
  assert.match(page, /ProductPurchaseActions/)
  assert.doesNotMatch(page, /useState|useCart/)
  assert.match(actions, /^["']use client["']/m)
  assert.match(actions, /useCart/)
  assert.match(actions, /setIsCartOpen\(true\)/)
})

test("public shell keeps static chrome on the server and only route switching in a client boundary", () => {
  const shell = source("components/site-shell.tsx")
  const routerPath = new URL("../components/site-shell-router.tsx", import.meta.url)

  assert.equal(existsSync(routerPath), true, "route-aware client shell boundary must exist")
  const router = readFileSync(routerPath, "utf8")

  assert.doesNotMatch(shell, /^["']use client["']/m)
  assert.doesNotMatch(shell, /usePathname/)
  assert.match(shell, /SiteShellRouter/)
  assert.match(shell, /<FaqSection/)
  assert.match(shell, /<Footer/)
  assert.match(router, /^["']use client["']/m)
  assert.match(router, /usePathname/)
  assert.match(router, /CartProvider/)
})

test("FAQ footer and background no longer require client javascript or expensive animated blur layers", () => {
  const faq = source("components/faq-section.tsx")
  const footer = source("components/footer.tsx")
  const background = source("components/animated-background.tsx")

  assert.doesNotMatch(faq, /^["']use client["']/m)
  assert.doesNotMatch(footer, /^["']use client["']/m)
  assert.doesNotMatch(background, /^["']use client["']/m)
  assert.match(faq, /<details/)
  assert.match(faq, /<summary/)
  assert.doesNotMatch(faq, /Accordion/)
  assert.doesNotMatch(background, /animate-smoke|filter:\s*["']blur/)
})

test("public surfaces avoid continuous backdrop blur composition", () => {
  for (const path of [
    "components/navbar.tsx",
    "components/storefront-product-card.tsx",
    "components/pages/products-page.tsx",
    "components/faq-section.tsx",
    "components/footer.tsx",
    "components/cart-panel.tsx",
    "components/pages/contact-page.tsx",
    "app/termos/page.tsx",
    "app/privacidade/page.tsx",
    "app/trocas-e-reembolsos/page.tsx",
  ]) {
    assert.doesNotMatch(source(path), /backdrop-blur/, path + " should not use backdrop blur")
  }
})

test("navbar checks auth once then follows auth events instead of refetching on every pathname", () => {
  const navbar = source("components/navbar.tsx")

  assert.match(navbar, /auth\.getUser\s*\(/)
  assert.match(navbar, /auth\.onAuthStateChange\s*\(/)
  assert.match(navbar, /subscription\.unsubscribe\s*\(/)
  assert.doesNotMatch(navbar, /\},\s*\[pathname\]\)/)
})

test("lightweight catalog is demand-loaded and shared instead of fetched on every empty-cart page view", () => {
  const cart = source("contexts/cart-context.tsx")
  const navbar = source("components/navbar.tsx")

  assert.match(cart, /type CatalogStatus = ["']idle["']/)
  assert.match(cart, /ensureCatalog/)
  assert.match(cart, /catalogRequestRef/)
  assert.match(cart, /storedLines\.length > 0/)
  assert.match(navbar, /ensureCatalog/)
  assert.match(navbar, /setIsSearchOpen/)
  assert.match(navbar, /setIsCategoriesOpen/)
})

test("shipping option javascript is deferred until the customer starts calculating freight", () => {
  const cart = source("components/cart-panel.tsx")

  assert.match(cart, /dynamic\s*\(/)
  assert.match(cart, /import\(["']@\/components\/shipping-options["']\)/)
  assert.match(cart, /hasValidCep\s*\?\s*\(/)
})
