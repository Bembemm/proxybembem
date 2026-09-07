export interface StoredCartLine {
  productId: number
  quantity: number
}

export interface ReconciledCartItem<TProduct extends { id: number }> {
  product: TProduct
  quantity: number
}

export interface ReconciledStoredCart<TProduct extends { id: number }> {
  items: ReconciledCartItem<TProduct>[]
  removedCount: number
}

function isPositiveInteger(value: unknown): value is number {
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

export function reconcileStoredCartWithCatalog<TProduct extends { id: number }>(
  lines: StoredCartLine[],
  products: TProduct[],
): ReconciledStoredCart<TProduct> {
  const productsById = new Map(products.map((product) => [product.id, product]))
  const items: ReconciledCartItem<TProduct>[] = []
  let removedCount = 0

  for (const line of lines) {
    const product = productsById.get(line.productId)
    if (!product) {
      removedCount += 1
      continue
    }

    items.push({ product, quantity: line.quantity })
  }

  return { items, removedCount }
}

export function serializeCart<T extends { product: { id: number }; quantity: number }>(
  items: T[],
): StoredCartLine[] {
  return items.map((item) => ({
    productId: item.product.id,
    quantity: item.quantity,
  }))
}
