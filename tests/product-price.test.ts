import assert from "node:assert/strict"
import test from "node:test"
import { hasProductDiscount } from "../lib/product-price.ts"

test("shows an original price only when it is a real discount", () => {
  assert.equal(hasProductDiscount({ discountPrice: 69.99 }), false)
  assert.equal(hasProductDiscount({ originalPrice: 69.99, discountPrice: 69.99 }), false)
  assert.equal(hasProductDiscount({ originalPrice: 60, discountPrice: 69.99 }), false)
  assert.equal(hasProductDiscount({ originalPrice: 150, discountPrice: 119.9 }), true)
})
