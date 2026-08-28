import { buildCheckoutOrder } from "./checkout-order.ts"
import { getMelhorEnvioEnv } from "./env.ts"
import { quoteMelhorEnvio, type ShippingQuoteOption } from "./melhor-envio.ts"
import {
  createCartFingerprint,
  createShippingQuoteToken,
} from "./shipping-quote-token.ts"

export interface PublicShippingOption {
  serviceId: string
  serviceName: string
  carrierName: string
  priceCents: number
  deliveryDays: number
  quoteToken: string
}

export interface TrustedShippingOption extends PublicShippingOption {
  packages: unknown[]
}

export interface ShippingQuoteResult {
  cartFingerprint: string
  options: TrustedShippingOption[]
}

export class ShippingUnavailableError extends Error {
  constructor() {
    super("Shipping unavailable")
    this.name = "ShippingUnavailableError"
  }
}

function normalizeDestinationCep(value: string) {
  const cep = value.replace(/\D/g, "")
  if (!/^\d{8}$/.test(cep)) {
    throw new Error("CEP de destino inválido")
  }
  return cep
}

function toTrustedOption(
  option: ShippingQuoteOption,
  input: {
    destinationCep: string
    cartFingerprint: string
    quoteSecret: string
    nowMs: number
  },
): TrustedShippingOption {
  return {
    serviceId: option.serviceId,
    serviceName: option.serviceName,
    carrierName: option.carrierName,
    priceCents: option.priceCents,
    deliveryDays: option.deliveryDays,
    packages: option.packages,
    quoteToken: createShippingQuoteToken(
      {
        serviceId: option.serviceId,
        priceCents: option.priceCents,
        destinationCep: input.destinationCep,
        cartFingerprint: input.cartFingerprint,
      },
      input.quoteSecret,
      input.nowMs,
    ),
  }
}

export async function buildShippingQuoteResult(input: {
  items: unknown
  destinationCep: string
}): Promise<ShippingQuoteResult> {
  if (typeof input.destinationCep !== "string") {
    throw new Error("CEP de destino inválido")
  }

  const destinationCep = normalizeDestinationCep(input.destinationCep)
  const checkoutOrder = buildCheckoutOrder(input.items)
  const cartFingerprint = createCartFingerprint(
    checkoutOrder.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
  )

  let quoteSecret: string
  let providerOptions: ShippingQuoteOption[]
  try {
    quoteSecret = getMelhorEnvioEnv().quoteSecret
    providerOptions = await quoteMelhorEnvio({
      destinationCep,
      products: checkoutOrder.items.map((item) => ({
        id: String(item.productId),
        widthCm: item.shipping.widthCm,
        heightCm: item.shipping.heightCm,
        lengthCm: item.shipping.lengthCm,
        weightKg: item.shipping.weightKg,
        insuranceValue: item.unitPriceCents / 100,
        quantity: item.quantity,
      })),
    })
  } catch {
    throw new ShippingUnavailableError()
  }

  if (providerOptions.length === 0) {
    throw new ShippingUnavailableError()
  }

  const sorted = [...providerOptions].sort(
    (a, b) => a.priceCents - b.priceCents || a.deliveryDays - b.deliveryDays,
  )
  const nowMs = Date.now()

  return {
    cartFingerprint,
    options: sorted.map((option) =>
      toTrustedOption(option, {
        destinationCep,
        cartFingerprint,
        quoteSecret,
        nowMs,
      }),
    ),
  }
}

export function toPublicShippingOptions(
  result: ShippingQuoteResult,
): PublicShippingOption[] {
  return result.options.map((option) => ({
    serviceId: option.serviceId,
    serviceName: option.serviceName,
    carrierName: option.carrierName,
    priceCents: option.priceCents,
    deliveryDays: option.deliveryDays,
    quoteToken: option.quoteToken,
  }))
}
