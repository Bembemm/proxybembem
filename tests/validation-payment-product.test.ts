import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import * as productCatalog from "../data/products.ts"
import { buildCheckoutOrder } from "../lib/server/checkout-order.ts"

const VALIDATION_PRODUCT_ID = 9001

test("catalog exposes a R$5 validation-only product outside the public storefront", () => {
  const validationProduct = productCatalog.products.find(
    (product) => product.id === VALIDATION_PRODUCT_ID,
  )

  assert.ok(validationProduct, "validation product must exist in the trusted catalog")
  assert.equal(validationProduct.discountPrice, 5)
  assert.equal(
    (validationProduct as typeof validationProduct & { validationOnly?: boolean }).validationOnly,
    true,
  )

  const storefrontProducts = (
    productCatalog as typeof productCatalog & {
      storefrontProducts?: typeof productCatalog.products
    }
  ).storefrontProducts

  assert.ok(storefrontProducts, "catalog must expose storefrontProducts")
  assert.equal(
    storefrontProducts.some((product) => product.id === VALIDATION_PRODUCT_ID),
    false,
  )
})

test("server rebuilds the validation product subtotal as exactly R$5", () => {
  const result = buildCheckoutOrder([{ productId: VALIDATION_PRODUCT_ID, quantity: 1 }])

  assert.equal(result.subtotalCents, 500)
  assert.equal(result.items[0]?.unitPriceCents, 500)
  assert.equal(result.items[0]?.productId, VALIDATION_PRODUCT_ID)
})

test("public products page consumes storefrontProducts instead of the full trusted catalog", () => {
  const productsPage = readFileSync(
    new URL("../components/pages/products-page.tsx", import.meta.url),
    "utf8",
  )

  assert.match(productsPage, /storefrontProducts/)
})

test("validation payment route exists and opts out of search indexing", () => {
  const route = new URL("../app/validacao-pagamento/page.tsx", import.meta.url)
  assert.equal(existsSync(route), true, "validation payment route must exist")

  const source = readFileSync(route, "utf8")
  assert.match(source, /Validação de pagamento/)
  assert.match(source, /index:\s*false/)
  assert.match(source, /follow:\s*false/)
})
