import type { CatalogProduct } from "../products/product.ts"
import { getPublishedProductsByIds } from "./product-catalog.ts"

export interface CheckoutOrderItem {
  productId: number
  title: string
  unitPriceCents: number
  quantity: number
  shipping: {
    weightKg: number
    lengthCm: number
    widthCm: number
    heightCm: number
  }
}

export interface CheckoutOrder {
  items: CheckoutOrderItem[]
  subtotalCents: number
}

export type ResolveCheckoutProducts = (ids: number[]) => Promise<CatalogProduct[]>

function assertLineItem(value: unknown): asserts value is { productId: number; quantity: number } {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid cart item")
  }

  const item = value as { productId?: unknown; quantity?: unknown }
  if (
    typeof item.productId !== "number" ||
    !Number.isInteger(item.productId) ||
    item.productId <= 0 ||
    typeof item.quantity !== "number" ||
    !Number.isInteger(item.quantity) ||
    item.quantity < 1 ||
    item.quantity > 20
  ) {
    throw new Error("Invalid cart item")
  }
}

function assertValidShipping(value: {
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
}) {
  const values = [value.weightKg, value.lengthCm, value.widthCm, value.heightCm]
  if (values.some((candidate) => !Number.isFinite(candidate) || candidate <= 0)) {
    throw new Error("Invalid catalog shipping metadata")
  }
}

export async function buildCheckoutOrder(
  value: unknown,
  resolveProducts: ResolveCheckoutProducts = getPublishedProductsByIds,
): Promise<CheckoutOrder> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new Error("Invalid cart")
  }

  const quantities = new Map<number, number>()

  for (const candidate of value) {
    assertLineItem(candidate)
    const quantity = (quantities.get(candidate.productId) ?? 0) + candidate.quantity
    if (quantity > 20) {
      throw new Error("Quantity limit exceeded")
    }
    quantities.set(candidate.productId, quantity)
  }

  const productIds = [...quantities.keys()]
  const resolvedProducts = await resolveProducts(productIds)
  if (!Array.isArray(resolvedProducts)) {
    throw new Error("Invalid catalog response")
  }

  const productsById = new Map<number, CatalogProduct>()
  for (const product of resolvedProducts) {
    if (
      product.status !== "published" ||
      !quantities.has(product.id) ||
      productsById.has(product.id)
    ) {
      throw new Error("Invalid catalog response")
    }
    productsById.set(product.id, product)
  }

  const items: CheckoutOrderItem[] = []

  for (const [productId, quantity] of quantities) {
    const product = productsById.get(productId)
    if (!product) {
      throw new Error("Unknown product")
    }

    const unitPriceCents = Math.round(product.discountPrice * 100)
    if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents <= 0) {
      throw new Error("Invalid catalog price")
    }

    assertValidShipping(product.shipping)

    items.push({
      productId: product.id,
      title: product.title,
      unitPriceCents,
      quantity,
      shipping: {
        weightKg: product.shipping.weightKg,
        lengthCm: product.shipping.lengthCm,
        widthCm: product.shipping.widthCm,
        heightCm: product.shipping.heightCm,
      },
    })
  }

  const subtotalCents = items.reduce(
    (total, item) => total + item.unitPriceCents * item.quantity,
    0,
  )

  if (!Number.isSafeInteger(subtotalCents) || subtotalCents <= 0) {
    throw new Error("Invalid order total")
  }

  return { items, subtotalCents }
}
