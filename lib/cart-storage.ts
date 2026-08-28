export interface StoredCartLine {
  productId: number
  quantity: number
}

interface RuntimeCartLike {
  product: {
    id: number
  }
  quantity: number
}

function isPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

export function parseStoredCart(value: unknown): StoredCartLine[] | null {
  if (!Array.isArray(value)) return null

  const parsed: StoredCartLine[] = []

  for (const item of value) {
    if (!item || typeof item !== "object") return null

    const candidate = item as {
      productId?: unknown
      quantity?: unknown
      product?: { id?: unknown }
    }

    const productId =
      typeof candidate.productId === "number"
        ? candidate.productId
        : typeof candidate.product?.id === "number"
          ? candidate.product.id
          : null

    if (!isPositiveInteger(productId) || !isPositiveInteger(candidate.quantity)) {
      return null
    }

    parsed.push({ productId, quantity: candidate.quantity })
  }

  return parsed
}

export function serializeCart(items: RuntimeCartLike[]): StoredCartLine[] {
  return items.map((item) => ({
    productId: item.product.id,
    quantity: item.quantity,
  }))
}
