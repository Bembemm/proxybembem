import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

test("storefront has a dedicated dynamic product page with breadcrumb and approved detail layout", () => {
  const routeUrl = new URL("../app/produtos/[produto]/page.tsx", import.meta.url)
  const pageUrl = new URL("../components/product-page.tsx", import.meta.url)

  assert.equal(existsSync(routeUrl), true, "dynamic product route must exist")
  assert.equal(existsSync(pageUrl), true, "product page presentation must exist")

  const route = readFileSync(routeUrl, "utf8")
  const page = readFileSync(pageUrl, "utf8")
  const purchaseActions = source("components/product-purchase-actions.tsx")

  assert.match(route, /notFound/)
  assert.match(route, /getPublishedProductsByIds/)
  assert.match(route, /generateMetadata/)
  assert.match(route, /ProductPage/)
  assert.match(page, /Início/)
  assert.match(page, /Produtos/)
  assert.match(page, /Informações importantes/)
  assert.match(page, /Descrição/)
  assert.match(page, /ProductPurchaseActions/)
  assert.match(purchaseActions, /Adicionar ao carrinho/i)
  assert.match(purchaseActions, /Comprar agora/i)
  assert.match(page, /product\.details/)
  assert.match(page, /product\.sections/)
  assert.match(page, /productionLeadTimeBusinessDays/)
})

test("storefront cards navigate to product pages instead of opening the old detail modal", () => {
  const card = source("components/storefront-product-card.tsx")
  const home = source("components/pages/home-page.tsx")
  const products = source("components/pages/products-page.tsx")

  assert.match(card, /productHref\(product\)/)
  assert.match(card, /href=\{productHref\(product\)\}/)
  assert.doesNotMatch(card, /onViewDetails/)
  assert.doesNotMatch(home, /ProductDetailModal/)
  assert.doesNotMatch(products, /ProductDetailModal/)
})

test("header keeps profile visible on mobile and offers live product-name suggestions", () => {
  const navbar = source("components/navbar.tsx")

  assert.match(navbar, /Produtos sugeridos/)
  assert.match(navbar, /product\.title/)
  assert.match(navbar, /normalizeSearch/)
  assert.match(navbar, /slice\(0,\s*5\)/)
  assert.match(navbar, /productHref\(product\)/)
  assert.match(navbar, /Ver todos os resultados/)
  assert.match(navbar, /\{accountButton\}\s*\{cartButton\}/)
  assert.doesNotMatch(navbar, /hidden lg:block["']>\{accountButton\}/)
})
