import { getProductById } from "@/lib/catalog"
import { brlToCents } from "@/lib/money"
import type { CheckoutQuote, PricedCheckoutItem } from "@/types/commerce"

const MAX_CART_LINES = 50
const MAX_QUANTITY_PER_ITEM = 20

export class CheckoutValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CheckoutValidationError"
  }
}

function parseItem(value: unknown) {
  if (typeof value !== "object" || value === null) {
    throw new CheckoutValidationError("Item do carrinho inválido.")
  }

  const item = value as Record<string, unknown>
  const productId = item.productId
  const quantity = item.quantity

  if (!Number.isInteger(productId) || (productId as number) <= 0) {
    throw new CheckoutValidationError("Produto inválido.")
  }

  if (
    !Number.isInteger(quantity) ||
    (quantity as number) <= 0 ||
    (quantity as number) > MAX_QUANTITY_PER_ITEM
  ) {
    throw new CheckoutValidationError("Quantidade inválida.")
  }

  return {
    productId: productId as number,
    quantity: quantity as number,
  }
}

export function priceCheckoutItems(value: unknown): CheckoutQuote {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CheckoutValidationError("O carrinho está vazio.")
  }

  if (value.length > MAX_CART_LINES) {
    throw new CheckoutValidationError("O carrinho possui itens demais.")
  }

  const quantitiesByProduct = new Map<number, number>()

  for (const rawItem of value) {
    const item = parseItem(rawItem)
    const nextQuantity =
      (quantitiesByProduct.get(item.productId) ?? 0) + item.quantity

    if (nextQuantity > MAX_QUANTITY_PER_ITEM) {
      throw new CheckoutValidationError("Quantidade máxima por produto excedida.")
    }

    quantitiesByProduct.set(item.productId, nextQuantity)
  }

  const pricedItems: PricedCheckoutItem[] = []
  let subtotalCents = 0

  for (const [productId, quantity] of quantitiesByProduct) {
    const product = getProductById(productId)

    if (!product) {
      throw new CheckoutValidationError(`Produto ${productId} não encontrado.`)
    }

    const unitPriceCents = brlToCents(product.discountPrice)
    const lineTotalCents = unitPriceCents * quantity

    pricedItems.push({
      productId,
      title: product.title,
      quantity,
      unitPriceCents,
      lineTotalCents,
    })

    subtotalCents += lineTotalCents
  }

  return {
    currency: "BRL",
    items: pricedItems,
    subtotalCents,
  }
}
