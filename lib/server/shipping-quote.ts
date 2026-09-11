import {
  buildCheckoutOrder,
  type ResolveCheckoutProducts,
} from "./checkout-order.ts"
import { getMelhorEnvioEnv } from "./env.ts"
import {
  MelhorEnvioProviderError,
  quoteMelhorEnvio,
  type ShippingProductInput,
  type ShippingQuoteOption,
} from "./melhor-envio.ts"
import { getPublishedProductsByIds } from "./product-catalog.ts"
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

const GENERIC_SHIPPING_MESSAGE =
  "Não foi possível calcular o frete agora. Confira o CEP e tente novamente."

export function formatShippingUnavailableMessage(_error: ShippingUnavailableError) {
  return GENERIC_SHIPPING_MESSAGE
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

type ShippingQuoteProvider = (input: {
  destinationCep: string
  products: ShippingProductInput[]
}) => Promise<ShippingQuoteOption[]>

export function createShippingQuoteBuilder(deps: {
  quoteProvider: ShippingQuoteProvider
  getQuoteSecret: () => string
  resolveProducts: ResolveCheckoutProducts
}) {
  return async function build(input: {
    items: unknown
    destinationCep: string
  }): Promise<ShippingQuoteResult> {
    if (typeof input.destinationCep !== "string") {
      throw new Error("CEP de destino inválido")
    }

    const destinationCep = normalizeDestinationCep(input.destinationCep)
    const checkoutOrder = await buildCheckoutOrder(input.items, deps.resolveProducts)
    const cartFingerprint = createCartFingerprint(
      checkoutOrder.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    )

    let quoteSecret: string
    let providerOptions: ShippingQuoteOption[]
    try {
      quoteSecret = deps.getQuoteSecret()
      providerOptions = await deps.quoteProvider({
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
    } catch (error) {
      if (error instanceof MelhorEnvioProviderError) {
        console.error("Melhor Envio quote request failed", {
          providerStatus: error.status,
        })
      } else {
        console.error("Shipping quote configuration or internal failure", {
          errorType: error instanceof Error ? error.name : "unknown",
        })
      }
      throw new ShippingUnavailableError()
    }

    if (providerOptions.length === 0) {
      console.error("Melhor Envio quote returned no valid services")
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
}

export const buildShippingQuoteResult = createShippingQuoteBuilder({
  quoteProvider: quoteMelhorEnvio,
  getQuoteSecret: () => getMelhorEnvioEnv().quoteSecret,
  resolveProducts: getPublishedProductsByIds,
})

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
