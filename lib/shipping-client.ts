import type { PublicShippingOption } from "./server/shipping-quote.ts"

export interface ShippingClientState {
  shippingOptions: PublicShippingOption[]
  selectedShipping: PublicShippingOption | null
  shippingError: string | null
  checkoutAttemptId: string | null
}

export function parsePublicShippingOptions(value: unknown): PublicShippingOption[] | null {
  if (!Array.isArray(value)) return null

  const options: PublicShippingOption[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null
    const candidate = entry as Partial<PublicShippingOption>
    if (
      typeof candidate.serviceId !== "string" ||
      !candidate.serviceId ||
      typeof candidate.serviceName !== "string" ||
      !candidate.serviceName ||
      typeof candidate.carrierName !== "string" ||
      !candidate.carrierName ||
      !Number.isSafeInteger(candidate.priceCents) ||
      (candidate.priceCents ?? 0) <= 0 ||
      !Number.isSafeInteger(candidate.deliveryDays) ||
      (candidate.deliveryDays ?? -1) < 0 ||
      typeof candidate.quoteToken !== "string" ||
      !candidate.quoteToken
    ) {
      return null
    }
    options.push(candidate as PublicShippingOption)
  }

  return options
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
