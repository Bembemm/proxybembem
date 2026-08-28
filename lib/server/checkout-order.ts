import { products } from "../../data/products.ts"

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

export function buildCheckoutOrder(value: unknown): CheckoutOrder {
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

  const items: CheckoutOrderItem[] = []

  for (const [productId, quantity] of quantities) {
    const product = products.find((candidate) => candidate.id === productId)
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
