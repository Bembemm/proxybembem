import test from "node:test"
import assert from "node:assert/strict"
import type { Product } from "../lib/products/product.ts"
import {
  buildCheckoutOrder,
  type CheckoutOrder,
} from "../lib/server/checkout-order.ts"

type ResolveCheckoutProducts = (ids: number[]) => Promise<Product[]>
type AsyncBuildCheckoutOrder = (
  value: unknown,
  resolveProducts: ResolveCheckoutProducts,
) => Promise<CheckoutOrder>

const buildAsync = buildCheckoutOrder as unknown as AsyncBuildCheckoutOrder

function catalogProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    status: "published",
    title: "Deck resolvido pelo catálogo",
    image: "/products/deck-commander.png",
    imagePath: "/products/deck-commander.png",
    originalPrice: 149.9,
    discountPrice: 123.45,
    tag: null,
    category: "Decks",
    colors: [],
    featured: true,
    highlights: [],
    description: "Produto de teste",
    details: [],
    sections: [],
    shipping: {
      weightKg: 0.7,
      lengthCm: 27,
      widthCm: 20,
      heightCm: 5,
    },
    displayOrder: 1,
    createdAt: "2026-09-07T12:00:00.000Z",
    updatedAt: "2026-09-07T12:00:00.000Z",
    ...overrides,
  }
}

test("rebuilds checkout title price and shipping from resolver, not browser data", async () => {
  const resolved = catalogProduct()
  const resolverCalls: number[][] = []

  const result = await buildAsync(
    [
      {
        productId: 1,
        quantity: 2,
        price: 0.01,
        title: "Browser fake",
        shipping: { weightKg: 0.001, lengthCm: 1, widthCm: 1, heightCm: 1 },
      },
    ],
    async (ids) => {
      resolverCalls.push(ids)
      return [resolved]
    },
  )

  assert.deepEqual(resolverCalls, [[1]])
  assert.equal(result.subtotalCents, 24690)
  assert.deepEqual(result.items, [
    {
      productId: 1,
      title: "Deck resolvido pelo catálogo",
      unitPriceCents: 12345,
      quantity: 2,
      shipping: {
        weightKg: 0.7,
        lengthCm: 27,
        widthCm: 20,
        heightCm: 5,
      },
    },
  ])
})

test("rejects a draft archived or missing product because resolver omits it", async () => {
  await assert.rejects(
    () =>
      buildAsync(
        [
          { productId: 1, quantity: 1 },
          { productId: 2, quantity: 1 },
        ],
        async () => [catalogProduct({ id: 1 })],
      ),
    /Unknown product/,
  )
})

test("uses a changed current price returned by resolver", async () => {
  const result = await buildAsync(
    [{ productId: 1, quantity: 1 }],
    async () => [catalogProduct({ discountPrice: 131.27 })],
  )

  assert.equal(result.items[0]?.unitPriceCents, 13127)
  assert.equal(result.subtotalCents, 13127)
})

test("merges duplicate product lines before calculating totals", async () => {
  const result = await buildAsync(
    [
      { productId: 1, quantity: 1 },
      { productId: 1, quantity: 2 },
    ],
    async () => [catalogProduct({ discountPrice: 119.9 })],
  )

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.quantity, 3)
  assert.equal(result.subtotalCents, 35970)
})

test("keeps cart quantity limits before resolving products", async () => {
  let resolverCalls = 0
  const resolver = async () => {
    resolverCalls += 1
    return [catalogProduct()]
  }

  await assert.rejects(
    () => buildAsync([{ productId: 1, quantity: 21 }], resolver),
    /Invalid cart item/,
  )
  await assert.rejects(
    () =>
      buildAsync(
        [
          { productId: 1, quantity: 11 },
          { productId: 1, quantity: 10 },
        ],
        resolver,
      ),
    /Quantity limit exceeded/,
  )
  assert.equal(resolverCalls, 0)
})
