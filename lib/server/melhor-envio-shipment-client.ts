import {
  getMelhorEnvioOAuthEnv,
  type MelhorEnvioEnvironment,
} from "./env.ts"
import type { MelhorEnvioOAuthScope } from "./melhor-envio-oauth-scopes.ts"
import {
  getMelhorEnvioAccessToken,
  type UsableMelhorEnvioAccessToken,
} from "./melhor-envio-token-manager.ts"
import { hasValidCnpjChecksum, hasValidCpfChecksum } from "./shipping-sender.ts"

const REQUEST_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 64 * 1024
const MAX_PROVIDER_ID = 256
const PROVIDER_ID_RE = /^[A-Za-z0-9._:-]{1,256}$/
const PHONE_RE = /^\d{10,15}$/
const POSTAL_CODE_RE = /^\d{8}$/
const STATE_RE = /^[A-Z]{2}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NF_E_KEY_RE = /^\d{44}$/
const CNAE_RE = /^\d{7}$/

export type MelhorEnvioShipmentProviderErrorClassification =
  | "unauthenticated"
  | "definite_rejection"
  | "outcome_unknown"
  | "invalid_response"

export class MelhorEnvioShipmentProviderError extends Error {
  readonly status: number | null
  readonly classification: MelhorEnvioShipmentProviderErrorClassification

  constructor(
    classification: MelhorEnvioShipmentProviderErrorClassification,
    status: number | null,
  ) {
    super("Melhor Envio shipment request failed")
    this.name = "MelhorEnvioShipmentProviderError"
    this.classification = classification
    this.status = status
  }
}

export interface MelhorEnvioShipmentSender {
  personType?: "pf" | "pj"
  fullName: string
  cpf: string | null
  cnpj?: string | null
  stateRegister?: string | null
  economicActivityCode?: string | null
  email: string
  phone: string
  postalCode: string
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
}

export interface MelhorEnvioShipmentSnapshot {
  service: {
    id: string
    name: string
    carrier: string
  }
  recipient: {
    name: string
    email: string
    phone: string
    document: string
    postalCode: string
    street: string
    number: string
    complement: string | null
    neighborhood: string
    city: string
    state: string
  }
  package: {
    height: number
    width: number
    length: number
    weight: number
    insuranceValueCents: number
  }
  declarationItems: Array<{
    productId: number
    description: string
    quantity: number
    unitValueCents: number
  }>
  declarationValueCents: number
}

interface AccessTokenOptions {
  forceRefresh?: boolean
  rejectedTokenVersion?: number
  requiredScopes?: readonly MelhorEnvioOAuthScope[]
}

interface ShipmentClientDependencies {
  getConfig(): {
    environment: MelhorEnvioEnvironment
    userAgent: string
  }
  getAccessToken(options?: AccessTokenOptions): Promise<UsableMelhorEnvioAccessToken>
}

interface ProviderResponse {
  status: number
  payload: unknown
}

function providerError(
  classification: MelhorEnvioShipmentProviderErrorClassification,
  status: number | null,
): never {
  throw new MelhorEnvioShipmentProviderError(classification, status)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function boundedString(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= min &&
    value.length <= max &&
    value === value.trim()
  )
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

function positiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function parseProviderId(value: unknown, status: number): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_PROVIDER_ID ||
    !PROVIDER_ID_RE.test(value)
  ) {
    providerError("invalid_response", status)
  }
  return value
}

function parseMoneyCents(value: unknown, status: number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) providerError("invalid_response", status)
    const cents = Math.round(value * 100)
    if (
      !Number.isSafeInteger(cents) ||
      cents <= 0 ||
      Math.abs(value * 100 - cents) > 1e-7
    ) {
      providerError("invalid_response", status)
    }
    return cents
  }

  if (typeof value !== "string") providerError("invalid_response", status)
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value)
  if (!match) providerError("invalid_response", status)
  const whole = Number(match[1])
  const fraction = Number((match[2] ?? "").padEnd(2, "0") || "0")
  const cents = whole * 100 + fraction
  if (!Number.isSafeInteger(cents) || cents <= 0) providerError("invalid_response", status)
  return cents
}

function baseUrl(environment: MelhorEnvioEnvironment) {
  return environment === "production"
    ? "https://melhorenvio.com.br"
    : "https://sandbox.melhorenvio.com.br"
}

async function readBoundedJson(response: Response): Promise<unknown> {
  let text: string
  try {
    text = await response.text()
  } catch {
    providerError("invalid_response", response.status)
  }

  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES || text.length === 0) {
    providerError("invalid_response", response.status)
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    providerError("invalid_response", response.status)
  }
}

function isAuthenticationFailure(status: number, payload: unknown) {
  return status === 401 || (isRecord(payload) && payload.message === "Unauthenticated.")
}

function classifyRejectedResponse(status: number): never {
  if (status >= 500) providerError("outcome_unknown", status)
  if (status >= 400) providerError("definite_rejection", status)
  providerError("invalid_response", status)
}

function validateClientConfig(config: ReturnType<ShipmentClientDependencies["getConfig"]>) {
  if (
    (config.environment !== "sandbox" && config.environment !== "production") ||
    !boundedString(config.userAgent, 1, 512)
  ) {
    throw new Error("Invalid Melhor Envio shipment configuration")
  }
}

function validatePerson(input: {
  name: string
  email: string
  phone: string
  postalCode: string
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
}) {
  if (
    !boundedString(input.name, 2, 120) ||
    !boundedString(input.email, 3, 254) ||
    !EMAIL_RE.test(input.email) ||
    !PHONE_RE.test(input.phone) ||
    !POSTAL_CODE_RE.test(input.postalCode) ||
    !boundedString(input.street, 1, 120) ||
    !boundedString(input.number, 1, 20) ||
    !(input.complement === null || boundedString(input.complement, 1, 80)) ||
    !boundedString(input.neighborhood, 1, 80) ||
    !boundedString(input.city, 1, 80) ||
    !STATE_RE.test(input.state)
  ) {
    throw new Error("Invalid Melhor Envio shipment person")
  }
}

function validateCartInput(input: {
  sender: MelhorEnvioShipmentSender
  snapshot: MelhorEnvioShipmentSnapshot
  documentMode: "declaration_content" | "invoice"
  invoiceKey?: string | null
}) {
  const personType = input.sender.personType ?? "pf"
  if (input.documentMode !== "declaration_content" && input.documentMode !== "invoice") {
    throw new Error("Invalid Melhor Envio shipment document mode")
  }

  validatePerson({
    name: input.sender.fullName,
    email: input.sender.email,
    phone: input.sender.phone,
    postalCode: input.sender.postalCode,
    street: input.sender.street,
    number: input.sender.number,
    complement: input.sender.complement,
    neighborhood: input.sender.neighborhood,
    city: input.sender.city,
    state: input.sender.state,
  })

  if (input.documentMode === "declaration_content") {
    if (
      personType !== "pf" ||
      typeof input.sender.cpf !== "string" ||
      !hasValidCpfChecksum(input.sender.cpf) ||
      (input.sender.cnpj ?? null) !== null ||
      (input.invoiceKey ?? null) !== null
    ) {
      throw new Error("Invalid Melhor Envio shipment sender")
    }
  } else if (
    personType !== "pj" ||
    input.sender.cpf !== null ||
    typeof input.sender.cnpj !== "string" ||
    !hasValidCnpjChecksum(input.sender.cnpj) ||
    !boundedString(input.sender.stateRegister, 1, 32) ||
    !(
      (input.sender.economicActivityCode ?? null) === null ||
      (typeof input.sender.economicActivityCode === "string" &&
        CNAE_RE.test(input.sender.economicActivityCode))
    ) ||
    typeof input.invoiceKey !== "string" ||
    !NF_E_KEY_RE.test(input.invoiceKey)
  ) {
    throw new Error("Invalid Melhor Envio shipment sender")
  }

  validatePerson(input.snapshot.recipient)
  if (!hasValidCpfChecksum(input.snapshot.recipient.document)) {
    throw new Error("Invalid Melhor Envio shipment recipient")
  }

  if (!/^\d+$/.test(input.snapshot.service.id)) {
    throw new Error("Invalid Melhor Envio shipment service")
  }
  const serviceId = Number(input.snapshot.service.id)
  if (!positiveSafeInteger(serviceId)) {
    throw new Error("Invalid Melhor Envio shipment service")
  }

  if (
    !boundedString(input.snapshot.service.name, 1, 120) ||
    !boundedString(input.snapshot.service.carrier, 1, 120) ||
    !positiveFinite(input.snapshot.package.height) ||
    !positiveFinite(input.snapshot.package.width) ||
    !positiveFinite(input.snapshot.package.length) ||
    !positiveFinite(input.snapshot.package.weight) ||
    !positiveSafeInteger(input.snapshot.package.insuranceValueCents) ||
    !positiveSafeInteger(input.snapshot.declarationValueCents) ||
    input.snapshot.package.insuranceValueCents !== input.snapshot.declarationValueCents ||
    !Array.isArray(input.snapshot.declarationItems) ||
    input.snapshot.declarationItems.length < 1 ||
    input.snapshot.declarationItems.length > 100
  ) {
    throw new Error("Invalid Melhor Envio shipment snapshot")
  }

  let total = 0
  const seen = new Set<number>()
  for (const item of input.snapshot.declarationItems) {
    if (
      !positiveSafeInteger(item.productId) ||
      seen.has(item.productId) ||
      !boundedString(item.description, 1, 500) ||
      !positiveSafeInteger(item.quantity) ||
      !positiveSafeInteger(item.unitValueCents)
    ) {
      throw new Error("Invalid Melhor Envio shipment declaration")
    }
    const line = item.quantity * item.unitValueCents
    if (!Number.isSafeInteger(line) || line <= 0) {
      throw new Error("Invalid Melhor Envio shipment declaration")
    }
    total += line
    if (!Number.isSafeInteger(total)) {
      throw new Error("Invalid Melhor Envio shipment declaration")
    }
    seen.add(item.productId)
  }
  if (total !== input.snapshot.declarationValueCents) {
    throw new Error("Invalid Melhor Envio shipment declaration")
  }

  return serviceId
}

function reais(cents: number) {
  return cents / 100
}

export function createMelhorEnvioShipmentClient(deps: ShipmentClientDependencies) {
  async function request(input: {
    path: string
    method: "POST"
    body: unknown
    requiredScopes: readonly MelhorEnvioOAuthScope[]
  }): Promise<ProviderResponse> {
    const config = deps.getConfig()
    validateClientConfig(config)
    const url = `${baseUrl(config.environment)}${input.path}`

    async function execute(token: UsableMelhorEnvioAccessToken): Promise<ProviderResponse> {
      let response: Response
      try {
        response = await fetch(url, {
          method: input.method,
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": config.userAgent,
          },
          body: JSON.stringify(input.body),
          cache: "no-store",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch {
        providerError("outcome_unknown", null)
      }

      return {
        status: response.status,
        payload: await readBoundedJson(response),
      }
    }

    const firstToken = await deps.getAccessToken({ requiredScopes: input.requiredScopes })
    let result = await execute(firstToken)

    if (isAuthenticationFailure(result.status, result.payload)) {
      const refreshed = await deps.getAccessToken({
        forceRefresh: true,
        rejectedTokenVersion: firstToken.tokenVersion,
        requiredScopes: input.requiredScopes,
      })
      result = await execute(refreshed)
      if (isAuthenticationFailure(result.status, result.payload)) {
        providerError("unauthenticated", result.status)
      }
    }

    if (result.status < 200 || result.status >= 300) {
      classifyRejectedResponse(result.status)
    }
    return result
  }

  async function addShipmentToMelhorEnvioCart(input: {
    sender: MelhorEnvioShipmentSender
    snapshot: MelhorEnvioShipmentSnapshot
    documentMode: "declaration_content" | "invoice"
    invoiceKey?: string | null
  }) {
    const serviceId = validateCartInput(input)
    const isInvoice = input.documentMode === "invoice"
    const commonFrom = {
      name: input.sender.fullName,
      email: input.sender.email,
      phone: input.sender.phone,
      address: input.sender.street,
      complement: input.sender.complement ?? "",
      number: input.sender.number,
      district: input.sender.neighborhood,
      city: input.sender.city,
      postal_code: input.sender.postalCode,
      state_abbr: input.sender.state,
      country_id: "BR",
    }
    const from = isInvoice
      ? {
          ...commonFrom,
          company_document: input.sender.cnpj,
          state_register: input.sender.stateRegister,
          ...(input.sender.economicActivityCode
            ? { economic_activity_code: input.sender.economicActivityCode }
            : {}),
        }
      : {
          ...commonFrom,
          document: input.sender.cpf,
          state_register: "ISENTO",
        }
    const commonOptions = {
      insurance_value: reais(input.snapshot.package.insuranceValueCents),
      receipt: false,
      own_hand: false,
      reverse: false,
    }

    const result = await request({
      path: "/api/v2/me/cart",
      method: "POST",
      requiredScopes: ["cart-write"],
      body: {
        service: serviceId,
        from,
        to: {
          name: input.snapshot.recipient.name,
          email: input.snapshot.recipient.email,
          phone: input.snapshot.recipient.phone,
          document: input.snapshot.recipient.document,
          address: input.snapshot.recipient.street,
          complement: input.snapshot.recipient.complement ?? "",
          number: input.snapshot.recipient.number,
          district: input.snapshot.recipient.neighborhood,
          city: input.snapshot.recipient.city,
          postal_code: input.snapshot.recipient.postalCode,
          state_abbr: input.snapshot.recipient.state,
          country_id: "BR",
        },
        products: input.snapshot.declarationItems.map((item) => ({
          name: item.description,
          quantity: item.quantity,
          unitary_value: reais(item.unitValueCents),
        })),
        volumes: [
          {
            height: input.snapshot.package.height,
            width: input.snapshot.package.width,
            length: input.snapshot.package.length,
            weight: input.snapshot.package.weight,
          },
        ],
        options: isInvoice
          ? {
              ...commonOptions,
              non_commercial: false,
              invoice: { key: input.invoiceKey },
            }
          : commonOptions,
      },
    })

    if (!isRecord(result.payload)) providerError("invalid_response", result.status)
    return {
      providerShipmentId: parseProviderId(result.payload.id, result.status),
      currentCostCents: parseMoneyCents(result.payload.price, result.status),
    }
  }

  return { addShipmentToMelhorEnvioCart }
}

const defaultClient = createMelhorEnvioShipmentClient({
  getConfig: () => {
    const env = getMelhorEnvioOAuthEnv()
    return { environment: env.environment, userAgent: env.userAgent }
  },
  getAccessToken: getMelhorEnvioAccessToken,
})

export const addShipmentToMelhorEnvioCart = defaultClient.addShipmentToMelhorEnvioCart
