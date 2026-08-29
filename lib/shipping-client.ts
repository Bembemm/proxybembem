import type { PublicShippingOption } from "./server/shipping-quote.ts"

export interface ShippingClientState {
  shippingOptions: PublicShippingOption[]
  selectedShipping: PublicShippingOption | null
  shippingError: string | null
  checkoutAttemptId: string | null
}

export function invalidateCheckoutSelection(
  state: ShippingClientState,
): ShippingClientState {
  return {
    ...state,
    shippingOptions: [],
    selectedShipping: null,
    shippingError: null,
    checkoutAttemptId: null,
  }
}

export function selectShippingOption(
  state: ShippingClientState,
  option: PublicShippingOption,
): ShippingClientState {
  return {
    ...state,
    selectedShipping: option,
    shippingError: null,
    checkoutAttemptId: null,
  }
}

export function applyShippingChanged(
  state: ShippingClientState,
  options: PublicShippingOption[],
): ShippingClientState {
  return {
    ...state,
    shippingOptions: options,
    selectedShipping: null,
    shippingError: "O valor do frete foi atualizado. Escolha uma opção novamente.",
    checkoutAttemptId: null,
  }
}

export function calculateCheckoutTotalCents(
  productSubtotalCents: number,
  selectedShipping: PublicShippingOption | null,
) {
  if (!Number.isSafeInteger(productSubtotalCents) || productSubtotalCents < 0) {
    throw new Error("Invalid product subtotal")
  }

  const shippingCents = selectedShipping?.priceCents ?? 0
  if (!Number.isSafeInteger(shippingCents) || shippingCents < 0) {
    throw new Error("Invalid shipping amount")
  }

  const total = productSubtotalCents + shippingCents
  if (!Number.isSafeInteger(total)) throw new Error("Invalid checkout total")
  return total
}
