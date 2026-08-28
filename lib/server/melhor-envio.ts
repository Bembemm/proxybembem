import { getMelhorEnvioEnv } from "./env.ts"

export interface ShippingProductInput {
  id: string
  widthCm: number
  heightCm: number
  lengthCm: number
  weightKg: number
  insuranceValue: number
  quantity: number
}

export interface ShippingQuoteOption {
  serviceId: string
  serviceName: string
  carrierName: string
  priceCents: number
  deliveryDays: number
  packages: unknown[]
}

export class MelhorEnvioProviderError extends Error {
  readonly status: number | null

  constructor(status: number | null) {
    super(
      status === null
        ? "Melhor Envio request failed"
        : `Melhor Envio request failed with status ${status}`,
    )
    this.name = "MelhorEnvioProviderError"
    this.status = status
  }
}

function parsePriceCents(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null
    const cents = Math.round(value * 100)
    return Number.isSafeInteger(cents) && cents > 0 ? cents : null
  }

  if (typeof value !== "string") return null
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null

  const reais = Number(match[1])
  const centsPart = Number((match[2] ?? "").padEnd(2, "0") || "0")
  const cents = reais * 100 + centsPart
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

function normalizeQuoteEntry(value: unknown): ShippingQuoteOption | null {
  if (!value || typeof value !== "object") return null

  const entry = value as {
    id?: unknown
    name?: unknown
    error?: unknown
    custom_price?: unknown
    custom_delivery_time?: unknown
    company?: unknown
    packages?: unknown
  }

  if (entry.error) return null

  const serviceId =
    typeof entry.id === "string" || typeof entry.id === "number"
      ? String(entry.id).trim()
      : ""
  const serviceName = typeof entry.name === "string" ? entry.name.trim() : ""
  const company =
    entry.company && typeof entry.company === "object"
      ? (entry.company as { name?: unknown })
      : null
  const carrierName = typeof company?.name === "string" ? company.name.trim() : ""
  const priceCents = parsePriceCents(entry.custom_price)
  const deliveryDays = entry.custom_delivery_time

  if (
    !serviceId ||
    !serviceName ||
    !carrierName ||
    priceCents === null ||
    typeof deliveryDays !== "number" ||
    !Number.isInteger(deliveryDays) ||
    deliveryDays < 0
  ) {
    return null
  }

  return {
    serviceId,
    serviceName,
    carrierName,
    priceCents,
    deliveryDays,
    packages: Array.isArray(entry.packages) ? entry.packages : [],
  }
}

export async function quoteMelhorEnvio(input: {
  destinationCep: string
  products: ShippingProductInput[]
}): Promise<ShippingQuoteOption[]> {
  const env = getMelhorEnvioEnv()
  const destinationCep = input.destinationCep.replace(/\D/g, "")
  if (!/^\d{8}$/.test(destinationCep)) {
    throw new Error("Invalid destination CEP")
  }
  if (!Array.isArray(input.products) || input.products.length < 1) {
    throw new Error("Shipping products are required")
  }

  const baseUrl =
    env.environment === "sandbox"
      ? "https://sandbox.melhorenvio.com.br"
      : "https://melhorenvio.com.br"

  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": env.userAgent,
      },
      body: JSON.stringify({
        from: { postal_code: env.originCep },
        to: { postal_code: destinationCep },
        products: input.products.map((product) => ({
          id: product.id,
          width: product.widthCm,
          height: product.heightCm,
          length: product.lengthCm,
          weight: product.weightKg,
          insurance_value: product.insuranceValue,
          quantity: product.quantity,
        })),
        options: { receipt: false, own_hand: false },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    if (error instanceof MelhorEnvioProviderError) throw error
    throw new MelhorEnvioProviderError(null)
  }

  if (!response.ok) {
    throw new MelhorEnvioProviderError(response.status)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new MelhorEnvioProviderError(response.status)
  }

  if (!Array.isArray(payload)) {
    throw new MelhorEnvioProviderError(response.status)
  }

  return payload.flatMap((entry) => {
    const normalized = normalizeQuoteEntry(entry)
    return normalized ? [normalized] : []
  })
}
