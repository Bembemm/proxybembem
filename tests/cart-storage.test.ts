import test from "node:test"
import assert from "node:assert/strict"
import { parseStoredCart, serializeCart } from "../lib/cart-storage.ts"

test("serializes only product IDs and quantities", () => {
  const stored = serializeCart([
    {
      product: { id: 1, title: "Tampered", discountPrice: 0.01 },
      quantity: 2,
    },
  ])

  assert.deepEqual(stored, [{ productId: 1, quantity: 2 }])
  assert.equal("product" in stored[0], false)
})

test("migrates a legacy cart by extracting only ID and quantity", () => {
  const parsed = parseStoredCart([
    {
      product: { id: 1, title: "Tampered", discountPrice: 0.01 },
      quantity: 3,
    },
  ])

  assert.deepEqual(parsed, [{ productId: 1, quantity: 3 }])
})

test("rejects invalid persisted quantities", () => {
  assert.equal(parseStoredCart([{ productId: 1, quantity: 0 }]), null)
  assert.equal(parseStoredCart([{ productId: 1, quantity: 1.5 }]), null)
})
