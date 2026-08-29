import { buildCheckoutOrder } from "./checkout-order.ts"
import { getMelhorEnvioEnv } from "./env.ts"
import {
  MelhorEnvioProviderError,
  quoteMelhorEnvio,
  type ShippingQuoteOption,
} from "./melhor-envio.ts"
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
  readonly diagnosticCode: string

  constructor(diagnosticCode = "unknown") {
    super("Shipping unavailable")
    this.name = "ShippingUnavailableError"
    this.diagnosticCode = diagnosticCode
  }
}

const GENERIC_SHIPPING_MESSAGE =
  "Não foi possível calcular o frete agora. Confira o CEP e tente novamente."

export function formatShippingUnavailableMessage(
  error: ShippingUnavailableError,
  vercelEnv: string | undefined,
) {
  return vercelEnv === "preview"
    ? `${GENERIC_SHIPPING_MESSAGE} [${error.diagnosticCode}]`
    : GENERIC_SHIPPING_MESSAGE
}

function configDiagnosticCode(error: unknown) {
  if (!(error instanceof Error)) return "config"

  switch (error.message) {
    case "Missing required server environment variable: MELHOR_ENVIO_ENVIRONMENT":
      return "config_missing_environment"
    case "Missing required server environment variable: MELHOR_ENVIO_ACCESS_TOKEN":
      return "config_missing_access_token"
    case "Missing required server environment variable: MELHOR_ENVIO_USER_AGENT":
      return "config_missing_user_agent"
    case "Missing required server environment variable: SHIPPING_ORIGIN_CEP":
      return "config_missing_origin_cep"
    case "Missing required server environment variable: SHIPPING_QUOTE_SECRET":
      return "config_missing_quote_secret"
    case "MELHOR_ENVIO_ENVIRONMENT must be sandbox or production":
      return "config_invalid_environment"
    case "SHIPPING_ORIGIN_CEP must contain exactly 8 digits":
      return "config_invalid_origin_cep"
    case "SHIPPING_QUOTE_SECRET must contain at least 32 characters":
      return "config_quote_secret_too_short"
    default:
      return "config"
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
  } catch (error) {
    if (error instanceof MelhorEnvioProviderError) {
      console.error("Melhor Envio quote request failed", {
        providerStatus: error.status,
      })
      throw new ShippingUnavailableError(
        error.status === null ? "provider_network" : `provider_${error.status}`,
      )
    }

    const diagnosticCode = configDiagnosticCode(error)
    console.error("Shipping quote configuration or internal failure", {
      diagnosticCode,
    })
    throw new ShippingUnavailableError(diagnosticCode)
  }

  if (providerOptions.length === 0) {
    console.error("Melhor Envio quote returned no valid services")
    throw new ShippingUnavailableError("no_services")
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
