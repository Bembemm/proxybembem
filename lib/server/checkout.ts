import { getProductById } from "@/lib/catalog"
import { brlToCents } from "@/lib/money"
import type {
  CheckoutItemInput,
  CheckoutQuote,
  PricedCheckoutItem,
} from "@/types/commerce"

const MAX_CART_LINES = 50
const MAX_QUANTITY_PER_ITEM = 20

export class CheckoutValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CheckoutValidationError"
  }
}

function validateItem(item: CheckoutItemInput) {
  if (!Number.isInteger(item.productId) || item.productId <= 0) {
    throw new CheckoutValidationError("Produto inválido.")
  }

  if (
    !Number.isInteger(item.quantity) ||
    item.quantity <= 0 ||
    item.quantity > MAX_QUANTITY_PER_ITEM
  ) {
    throw new CheckoutValidationError("Quantidade inválida.")
  }
}

export function priceCheckoutItems(items: CheckoutItemInput[]): CheckoutQuote {
  if (!Array.isArray(items) || items.length === 0) {
    throw new CheckoutValidationError("O carrinho está vazio.")
  }

  if (items.length > MAX_CART_LINES) {
    throw new CheckoutValidationError("O carrinho possui itens demais.")
  }

  const quantitiesByProduct = new Map<number, number>()

  for (const item of items) {
    validateItem(item)

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
