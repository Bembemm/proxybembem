import test from "node:test"
import assert from "node:assert/strict"
import { buildCheckoutOrder } from "../lib/server/checkout-order.ts"

test("rebuilds price and title from the server catalog", () => {
  const result = buildCheckoutOrder([
    { productId: 1, quantity: 2, price: 0.01, title: "Fake" } as never,
  ])

  assert.equal(result.subtotalCents, 23980)
  assert.deepEqual(result.items, [
    {
      productId: 1,
      title: "Deck Commander Proxy 100 Cartas",
      unitPriceCents: 11990,
      quantity: 2,
    },
  ])
})

test("merges duplicate product lines before calculating totals", () => {
  const result = buildCheckoutOrder([
    { productId: 1, quantity: 1 },
    { productId: 1, quantity: 2 },
  ])

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].quantity, 3)
  assert.equal(result.subtotalCents, 35970)
})

test("rejects unknown products and abusive quantities", () => {
  assert.throws(() => buildCheckoutOrder([{ productId: 999, quantity: 1 }]))
  assert.throws(() => buildCheckoutOrder([{ productId: 1, quantity: 21 }]))
})
