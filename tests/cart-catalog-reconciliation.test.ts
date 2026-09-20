import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  reconcileStoredCartWithCatalog,
  serializeCart,
} from "../lib/cart-storage.ts"

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

test("restored cart adopts the current catalog product data", () => {
  const currentProduct = {
    id: 7,
    title: "Preço atual",
    discountPrice: 74.9,
  }

  const result = reconcileStoredCartWithCatalog(
    [{ productId: 7, quantity: 2 }],
    [currentProduct],
  )

  assert.equal(result.removedCount, 0)
  assert.equal(result.items.length, 1)
  assert.strictEqual(result.items[0].product, currentProduct)
  assert.equal(result.items[0].product.discountPrice, 74.9)
  assert.equal(result.items[0].quantity, 2)
})

test("restored cart drops IDs missing from the published catalog", () => {
  const result = reconcileStoredCartWithCatalog(
    [
      { productId: 1, quantity: 1 },
      { productId: 2, quantity: 3 },
    ],
    [{ id: 2, title: "Ainda publicado" }],
  )

  assert.equal(result.removedCount, 1)
  assert.deepEqual(
    result.items.map((item: { product: { id: number }; quantity: number }) => ({
      id: item.product.id,
      quantity: item.quantity,
    })),
    [{ id: 2, quantity: 3 }],
  )
})

test("reconciled persistence still contains only product id and quantity", () => {
  const result = reconcileStoredCartWithCatalog(
    [{ productId: 4, quantity: 2 }],
    [{ id: 4, title: "Servidor", discountPrice: 123.45, internal: "ignored" }],
  )

  assert.deepEqual(serializeCart(result.items), [{ productId: 4, quantity: 2 }])
})

test("CartProvider hydrates through the no-store catalog API with no static catalog fallback", () => {
  const context = source("contexts/cart-context.tsx")

  assert.doesNotMatch(context, /@\/data\/products/)
  assert.match(context, /fetch\s*\(\s*["']\/api\/catalog["']/)
  assert.match(context, /cache:\s*["']no-store["']/)
  assert.match(context, /reconcileStoredCartWithCatalog/)
  assert.match(context, /catalogStatus/)
  assert.match(context, /retryCatalog/)
})

test("temporary catalog failure defers localStorage persistence instead of erasing stored IDs", () => {
  const context = source("contexts/cart-context.tsx")

  assert.match(context, /setCatalogStatus\s*\(\s*["']unavailable["']\s*\)/)
  assert.match(context, /if\s*\(\s*catalogStatus\s*!==\s*["']ready["']\s*\)\s*return/)
  assert.match(context, /localStorage\.setItem\s*\(\s*CART_STORAGE_KEY/)
})

test("browser storage failures cannot break the in-memory cart", () => {
  const context = source("contexts/cart-context.tsx")

  assert.match(context, /function removeStoredCartSafely\(\)/)
  assert.match(
    context,
    /try\s*\{\s*window\.localStorage\.removeItem\(CART_STORAGE_KEY\)[\s\S]*?\}\s*catch/,
  )
  assert.match(
    context,
    /try\s*\{\s*window\.localStorage\.setItem\(CART_STORAGE_KEY,[\s\S]*?\}\s*catch/,
  )
  assert.doesNotMatch(
    context,
    /function removeStoredCartSafely\(\)\s*\{\s*try\s*\{\s*removeStoredCartSafely\(\)/,
  )
})

test("cart panel exposes retry-safe catalog failure and one-time removed-product feedback", () => {
  const context = source("contexts/cart-context.tsx")
  const panel = source("components/cart-panel.tsx")

  assert.match(context, /Um produto do seu carrinho não está mais disponível\./)
  assert.match(context, /dismissCartNotice/)
  assert.match(panel, /catalogStatus/)
  assert.match(panel, /retryCatalog/)
  assert.match(panel, /cartNotice/)
  assert.match(panel, /dismissCartNotice/)
  assert.match(panel, /Não foi possível atualizar seu carrinho/)
})
