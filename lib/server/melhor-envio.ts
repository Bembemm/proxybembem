import { getMelhorEnvioEnv, type MelhorEnvioEnvironment } from "./env.ts"
import {
  getMelhorEnvioAccessToken,
  type UsableMelhorEnvioAccessToken,
} from "./melhor-envio-token-manager.ts"

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

interface MelhorEnvioQuoteDependencies {
  getConfig(): {
    environment: MelhorEnvioEnvironment
    userAgent: string
    originCep: string
  }
  getAccessToken(options?: {
    forceRefresh?: boolean
    rejectedTokenVersion?: number
  }): Promise<UsableMelhorEnvioAccessToken>
}

const REQUEST_TIMEOUT_MS = 10_000
const MAX_ACCESS_TOKEN_LENGTH = 8192
const MAX_AUTH_ERROR_BYTES = 4096

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

function validateAccessToken(
  credential: UsableMelhorEnvioAccessToken,
): UsableMelhorEnvioAccessToken {
  if (
    typeof credential.accessToken !== "string" ||
    credential.accessToken.length < 1 ||
    credential.accessToken.length > MAX_ACCESS_TOKEN_LENGTH ||
    !Number.isSafeInteger(credential.tokenVersion) ||
    credential.tokenVersion <= 0
  ) {
    throw new MelhorEnvioProviderError(null)
  }
  return credential
}

function baseUrl(environment: MelhorEnvioEnvironment) {
  return environment === "sandbox"
    ? "https://sandbox.melhorenvio.com.br"
    : "https://melhorenvio.com.br"
}

function buildRequestBody(input: {
  originCep: string
  destinationCep: string
  products: ShippingProductInput[]
}) {
  return JSON.stringify({
    from: { postal_code: input.originCep },
    to: { postal_code: input.destinationCep },
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
  })
}

async function requestQuoteWithToken(input: {
  environment: MelhorEnvioEnvironment
  userAgent: string
  body: string
  accessToken: string
}): Promise<Response> {
  try {
    return await fetch(`${baseUrl(input.environment)}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": input.userAgent,
      },
      body: input.body,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new MelhorEnvioProviderError(null)
  }
}

async function readBoundedErrorMessage(response: Response): Promise<string | null> {
  const declaredLength = response.headers.get("content-length")
  if (declaredLength) {
    const length = Number(declaredLength)
    if (Number.isFinite(length) && length > MAX_AUTH_ERROR_BYTES) return null
  }

  const reader = response.body?.getReader()
  if (!reader) return null

  const decoder = new TextDecoder()
  let text = ""
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_AUTH_ERROR_BYTES) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } catch {
    return null
  }

  let payload: unknown
  try {
    payload = JSON.parse(text) as unknown
  } catch {
    return null
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  const message = (payload as { message?: unknown }).message
  return typeof message === "string" ? message.trim() : null
}

async function isAuthenticationFailure(response: Response) {
  if (response.status === 401) return true
  return (await readBoundedErrorMessage(response)) === "Unauthenticated."
}

async function parseSuccessfulQuote(response: Response): Promise<ShippingQuoteOption[]> {
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

export function createMelhorEnvioQuoter(deps: MelhorEnvioQuoteDependencies) {
  return async function quote(input: {
    destinationCep: string
    products: ShippingProductInput[]
  }): Promise<ShippingQuoteOption[]> {
    const config = deps.getConfig()
    const destinationCep = input.destinationCep.replace(/\D/g, "")
    if (!/^\d{8}$/.test(destinationCep)) {
      throw new Error("Invalid destination CEP")
    }
    if (!Array.isArray(input.products) || input.products.length < 1) {
      throw new Error("Shipping products are required")
    }

    const body = buildRequestBody({
      originCep: config.originCep,
      destinationCep,
      products: input.products,
    })

    let credential = validateAccessToken(await deps.getAccessToken())
    let response = await requestQuoteWithToken({
      environment: config.environment,
      userAgent: config.userAgent,
      body,
      accessToken: credential.accessToken,
    })

    if (!response.ok) {
      const authenticationFailure = await isAuthenticationFailure(response)
      if (!authenticationFailure) {
        throw new MelhorEnvioProviderError(response.status)
      }

      credential = validateAccessToken(
        await deps.getAccessToken({
          forceRefresh: true,
          rejectedTokenVersion: credential.tokenVersion,
        }),
      )
      response = await requestQuoteWithToken({
        environment: config.environment,
        userAgent: config.userAgent,
        body,
        accessToken: credential.accessToken,
      })

      if (!response.ok) {
        throw new MelhorEnvioProviderError(response.status)
      }
    }

    return parseSuccessfulQuote(response)
  }
}

export const quoteMelhorEnvio = createMelhorEnvioQuoter({
  getConfig: () => getMelhorEnvioEnv(),
  getAccessToken: getMelhorEnvioAccessToken,
})
