import type { NextRequest } from "next/server.js"
import type { AdminAccessResult } from "./admin-auth.ts"
import {
  isAllowedCheckoutOrigin,
  resolvePublicSiteUrl,
  type MelhorEnvioEnvironment,
} from "./env.ts"
import {
  ShippingSenderConflictError,
  type ShippingSenderProfile,
  type UpsertShippingSenderProfileInput,
} from "./shipping-sender.ts"

const PRIVATE_NO_STORE =
  "private, no-cache, no-store, max-age=0, must-revalidate"
const CPF_RE = /^\d{11}$/
const PHONE_RE = /^\d{10,13}$/
const POSTAL_CODE_RE = /^\d{8}$/
const STATE_RE = /^[A-Z]{2}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface AdminShippingSenderActionDependencies {
  authorizeAdmin(): Promise<AdminAccessResult>
  consumeRateLimit(request: NextRequest): Promise<boolean>
  getConfig(): {
    environment: MelhorEnvioEnvironment
    originCep: string
  }
  getSenderProfile(
    environment: MelhorEnvioEnvironment,
  ): Promise<ShippingSenderProfile | null>
  upsertSenderProfile(
    input: UpsertShippingSenderProfileInput,
  ): Promise<ShippingSenderProfile>
}

function response(status: number, headers?: HeadersInit) {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": PRIVATE_NO_STORE,
      Pragma: "no-cache",
      ...headers,
    },
  })
}

function redirectFeedback(status: "sender-saved" | "sender-invalid" | "sender-conflict") {
  return response(303, {
    Location: `/admin/integrations/melhor-envio?status=${status}`,
  })
}

function adminFailureStatus(result: Exclude<AdminAccessResult, { ok: true }>) {
  if (result.reason === "unavailable") return 503
  if (result.reason === "not_admin") return 403
  return 401
}

function digits(value: string) {
  return value.replace(/\D/g, "")
}

function hasValidCpfChecksum(cpf: string): boolean {
  if (!CPF_RE.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false

  const values = [...cpf].map(Number)
  const firstSum = values
    .slice(0, 9)
    .reduce((sum, value, index) => sum + value * (10 - index), 0)
  const firstRemainder = (firstSum * 10) % 11
  const firstCheck = firstRemainder === 10 ? 0 : firstRemainder
  if (firstCheck !== values[9]) return false

  const secondSum = values
    .slice(0, 10)
    .reduce((sum, value, index) => sum + value * (11 - index), 0)
  const secondRemainder = (secondSum * 10) % 11
  const secondCheck = secondRemainder === 10 ? 0 : secondRemainder
  return secondCheck === values[10]
}

function bounded(value: string, min: number, max: number) {
  return value.length >= min && value.length <= max
}

function stringField(form: FormData, name: string): string | null {
  const values = form.getAll(name)
  if (values.length !== 1 || typeof values[0] !== "string") return null
  return values[0]
}

function optionalStringField(form: FormData, name: string): string | null | undefined {
  const values = form.getAll(name)
  if (values.length !== 1 || typeof values[0] !== "string") return undefined
  const value = values[0].trim()
  return value.length === 0 ? null : value
}

interface ParsedSenderForm {
  expectedVersion: number | null
  fullName: string
  cpf: string | null
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

function parseExpectedVersion(value: string): number | null | undefined {
  const normalized = value.trim()
  if (!normalized) return null
  if (!/^\d{1,15}$/.test(normalized)) return undefined
  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return undefined
  return parsed
}

function parseSenderForm(
  form: FormData,
  expectedOriginCep: string,
): ParsedSenderForm | null {
  const fullNameRaw = stringField(form, "fullName")
  const cpfRaw = stringField(form, "cpf")
  const emailRaw = stringField(form, "email")
  const phoneRaw = stringField(form, "phone")
  const postalCodeRaw = stringField(form, "postalCode")
  const streetRaw = stringField(form, "street")
  const numberRaw = stringField(form, "number")
  const complement = optionalStringField(form, "complement")
  const neighborhoodRaw = stringField(form, "neighborhood")
  const cityRaw = stringField(form, "city")
  const stateRaw = stringField(form, "state")
  const expectedVersionRaw = stringField(form, "expectedVersion")

  if (
    fullNameRaw === null ||
    cpfRaw === null ||
    emailRaw === null ||
    phoneRaw === null ||
    postalCodeRaw === null ||
    streetRaw === null ||
    numberRaw === null ||
    complement === undefined ||
    neighborhoodRaw === null ||
    cityRaw === null ||
    stateRaw === null ||
    expectedVersionRaw === null
  ) {
    return null
  }

  const fullName = fullNameRaw.trim()
  const cpfDigits = digits(cpfRaw)
  const email = emailRaw.trim().toLowerCase()
  const phone = digits(phoneRaw)
  const postalCode = digits(postalCodeRaw)
  const street = streetRaw.trim()
  const number = numberRaw.trim()
  const neighborhood = neighborhoodRaw.trim()
  const city = cityRaw.trim()
  const state = stateRaw.trim().toUpperCase()
  const expectedVersion = parseExpectedVersion(expectedVersionRaw)

  if (
    expectedVersion === undefined ||
    !bounded(fullName, 2, 120) ||
    (cpfDigits.length > 0 && !hasValidCpfChecksum(cpfDigits)) ||
    !bounded(email, 3, 254) ||
    !EMAIL_RE.test(email) ||
    !PHONE_RE.test(phone) ||
    !POSTAL_CODE_RE.test(postalCode) ||
    postalCode !== expectedOriginCep ||
    !bounded(street, 1, 120) ||
    !bounded(number, 1, 20) ||
    !(complement === null || bounded(complement, 1, 80)) ||
    !bounded(neighborhood, 1, 80) ||
    !bounded(city, 1, 80) ||
    !STATE_RE.test(state)
  ) {
    return null
  }

  return {
    expectedVersion,
    fullName,
    cpf: cpfDigits.length === 0 ? null : cpfDigits,
    email,
    phone,
    postalCode,
    street,
    number,
    complement,
    neighborhood,
    city,
    state,
  }
}

export function createAdminShippingSenderActionHandler(
  deps: AdminShippingSenderActionDependencies,
) {
  return async function POST(request: NextRequest): Promise<Response> {
    const requestOrigin = request.nextUrl.origin

    let siteUrl: string
    try {
      siteUrl = resolvePublicSiteUrl(requestOrigin)
    } catch {
      return response(503)
    }

    if (
      !isAllowedCheckoutOrigin({
        originHeader: request.headers.get("origin"),
        configuredSiteUrl: siteUrl,
        requestOrigin,
        nodeEnv: process.env.NODE_ENV,
      })
    ) {
      return response(403)
    }

    let allowed: boolean
    try {
      allowed = await deps.consumeRateLimit(request)
    } catch {
      return response(503)
    }
    if (!allowed) {
      return response(429, { "Retry-After": "600" })
    }

    let admin: AdminAccessResult
    try {
      admin = await deps.authorizeAdmin()
    } catch {
      return response(503)
    }
    if (!admin.ok) return response(adminFailureStatus(admin))

    let config: ReturnType<AdminShippingSenderActionDependencies["getConfig"]>
    try {
      config = deps.getConfig()
    } catch {
      return response(503)
    }

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return redirectFeedback("sender-invalid")
    }

    const parsed = parseSenderForm(form, config.originCep)
    if (!parsed) return redirectFeedback("sender-invalid")

    let cpf = parsed.cpf
    if (cpf === null) {
      let current: ShippingSenderProfile | null
      try {
        current = await deps.getSenderProfile(config.environment)
      } catch {
        return response(503)
      }
      if (!current) return redirectFeedback("sender-invalid")
      cpf = current.cpf
    }

    try {
      await deps.upsertSenderProfile({
        environment: config.environment,
        adminUserId: admin.principal.userId,
        expectedVersion: parsed.expectedVersion,
        fullName: parsed.fullName,
        cpf,
        email: parsed.email,
        phone: parsed.phone,
        postalCode: parsed.postalCode,
        street: parsed.street,
        number: parsed.number,
        complement: parsed.complement,
        neighborhood: parsed.neighborhood,
        city: parsed.city,
        state: parsed.state,
      })
    } catch (error) {
      if (error instanceof ShippingSenderConflictError) {
        return redirectFeedback("sender-conflict")
      }
      return response(503)
    }

    return redirectFeedback("sender-saved")
  }
}
