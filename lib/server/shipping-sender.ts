import { getSupabaseEnv, type MelhorEnvioEnvironment } from "./env.ts"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CPF_RE = /^\d{11}$/
const PHONE_RE = /^\d{10,13}$/
const POSTAL_CODE_RE = /^\d{8}$/
const STATE_RE = /^[A-Z]{2}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const SENDER_SELECT = [
  "id",
  "environment",
  "person_type",
  "full_name",
  "cpf",
  "email",
  "phone",
  "postal_code",
  "street",
  "number",
  "complement",
  "neighborhood",
  "city",
  "state",
  "version",
  "updated_at",
].join(",")

export interface ShippingSenderProfile {
  id: string
  environment: MelhorEnvioEnvironment
  fullName: string
  cpf: string
  email: string
  phone: string
  postalCode: string
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
  version: number
  updatedAt: string
}

export interface UpsertShippingSenderProfileInput {
  environment: MelhorEnvioEnvironment
  adminUserId: string
  expectedVersion: number | null
  fullName: string
  cpf: string
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

export class ShippingSenderConflictError extends Error {
  readonly code = "sender_conflict"

  constructor() {
    super("Shipping sender profile changed")
    this.name = "ShippingSenderConflictError"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isEnvironment(value: unknown): value is MelhorEnvioEnvironment {
  return value === "sandbox" || value === "production"
}

function isBoundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value))
}

function hasValidCpfChecksum(cpf: string): boolean {
  if (!CPF_RE.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false

  const digits = [...cpf].map(Number)
  const firstSum = digits
    .slice(0, 9)
    .reduce((sum, digit, index) => sum + digit * (10 - index), 0)
  const firstRemainder = (firstSum * 10) % 11
  const firstCheck = firstRemainder === 10 ? 0 : firstRemainder
  if (firstCheck !== digits[9]) return false

  const secondSum = digits
    .slice(0, 10)
    .reduce((sum, digit, index) => sum + digit * (11 - index), 0)
  const secondRemainder = (secondSum * 10) % 11
  const secondCheck = secondRemainder === 10 ? 0 : secondRemainder
  return secondCheck === digits[10]
}

function assertEnvironment(value: string): asserts value is MelhorEnvioEnvironment {
  if (!isEnvironment(value)) throw new Error("Invalid shipping sender environment")
}

function assertAdminUserId(value: string) {
  if (!UUID_RE.test(value)) throw new Error("Invalid shipping sender administrator")
}

function assertUpsertInput(input: UpsertShippingSenderProfileInput) {
  assertEnvironment(input.environment)
  assertAdminUserId(input.adminUserId)
  if (
    input.expectedVersion !== null &&
    !isPositiveSafeInteger(input.expectedVersion)
  ) {
    throw new Error("Invalid shipping sender version")
  }
  if (
    !isBoundedString(input.fullName, 2, 120) ||
    !hasValidCpfChecksum(input.cpf) ||
    !isBoundedString(input.email, 3, 254) ||
    !EMAIL_RE.test(input.email) ||
    input.email !== input.email.toLowerCase() ||
    !PHONE_RE.test(input.phone) ||
    !POSTAL_CODE_RE.test(input.postalCode) ||
    !isBoundedString(input.street, 1, 120) ||
    !isBoundedString(input.number, 1, 20) ||
    !(
      input.complement === null ||
      isBoundedString(input.complement, 1, 80)
    ) ||
    !isBoundedString(input.neighborhood, 1, 80) ||
    !isBoundedString(input.city, 1, 80) ||
    !STATE_RE.test(input.state)
  ) {
    throw new Error("Invalid shipping sender profile")
  }
}

function parseProfile(
  value: unknown,
  expectedEnvironment?: MelhorEnvioEnvironment,
): ShippingSenderProfile {
  if (!isRecord(value)) {
    throw new Error("Shipping sender storage returned an invalid response")
  }

  if (
    typeof value.id !== "string" ||
    !UUID_RE.test(value.id) ||
    !isEnvironment(value.environment) ||
    (expectedEnvironment !== undefined && value.environment !== expectedEnvironment) ||
    value.person_type !== "pf" ||
    !isBoundedString(value.full_name, 2, 120) ||
    typeof value.cpf !== "string" ||
    !hasValidCpfChecksum(value.cpf) ||
    !isBoundedString(value.email, 3, 254) ||
    !EMAIL_RE.test(value.email) ||
    typeof value.phone !== "string" ||
    !PHONE_RE.test(value.phone) ||
    typeof value.postal_code !== "string" ||
    !POSTAL_CODE_RE.test(value.postal_code) ||
    !isBoundedString(value.street, 1, 120) ||
    !isBoundedString(value.number, 1, 20) ||
    !(
      value.complement === null ||
      isBoundedString(value.complement, 1, 80)
    ) ||
    !isBoundedString(value.neighborhood, 1, 80) ||
    !isBoundedString(value.city, 1, 80) ||
    typeof value.state !== "string" ||
    !STATE_RE.test(value.state) ||
    !isPositiveSafeInteger(value.version) ||
    !isIsoTimestamp(value.updated_at)
  ) {
    throw new Error("Shipping sender storage returned an invalid response")
  }

  return {
    id: value.id,
    environment: value.environment,
    fullName: value.full_name,
    cpf: value.cpf,
    email: value.email,
    phone: value.phone,
    postalCode: value.postal_code,
    street: value.street,
    number: value.number,
    complement: value.complement,
    neighborhood: value.neighborhood,
    city: value.city,
    state: value.state,
    version: value.version,
    updatedAt: value.updated_at,
  }
}

async function senderRequest(path: string, init?: RequestInit) {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()
  let response: Response

  try {
    response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: supabaseSecretKey,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    console.error("Supabase shipping sender request failed", {
      operation: init?.method ?? "GET",
      resource: path.split("?")[0],
      status: "network",
    })
    throw new Error("Shipping sender storage request failed")
  }

  if (!response.ok) {
    console.error("Supabase shipping sender request failed", {
      operation: init?.method ?? "GET",
      resource: path.split("?")[0],
      status: response.status,
    })
    throw new Error("Shipping sender storage request failed")
  }

  return response
}

export function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "")
  if (!hasValidCpfChecksum(digits)) {
    throw new Error("Invalid shipping sender CPF")
  }
  return `***.***.***-${digits.slice(-2)}`
}

export async function getShippingSenderProfile(
  environment: MelhorEnvioEnvironment,
): Promise<ShippingSenderProfile | null> {
  assertEnvironment(environment)
  const params = new URLSearchParams({
    environment: `eq.${environment}`,
    select: SENDER_SELECT,
    limit: "1",
  })
  const response = await senderRequest(`shipping_sender_profiles?${params.toString()}`)
  const payload = (await response.json()) as unknown

  if (!Array.isArray(payload)) {
    throw new Error("Shipping sender storage returned an invalid response")
  }
  if (payload.length === 0) return null
  if (payload.length !== 1) {
    throw new Error("Shipping sender storage returned an invalid response")
  }
  return parseProfile(payload[0], environment)
}

export async function upsertShippingSenderProfile(
  input: UpsertShippingSenderProfileInput,
): Promise<ShippingSenderProfile> {
  assertUpsertInput(input)
  const response = await senderRequest("rpc/admin_upsert_shipping_sender_profile", {
    method: "POST",
    body: JSON.stringify({
      p_environment: input.environment,
      p_admin_user_id: input.adminUserId,
      p_expected_version: input.expectedVersion,
      p_full_name: input.fullName,
      p_cpf: input.cpf,
      p_email: input.email,
      p_phone: input.phone,
      p_postal_code: input.postalCode,
      p_street: input.street,
      p_number: input.number,
      p_complement: input.complement,
      p_neighborhood: input.neighborhood,
      p_city: input.city,
      p_state: input.state,
    }),
  })
  const payload = (await response.json()) as unknown

  if (!isRecord(payload) || typeof payload.outcome !== "string") {
    throw new Error("Shipping sender storage returned an invalid response")
  }
  if (payload.outcome === "conflict") {
    throw new ShippingSenderConflictError()
  }
  if (
    (payload.outcome !== "created" && payload.outcome !== "updated") ||
    !("profile" in payload)
  ) {
    throw new Error("Shipping sender storage returned an invalid response")
  }

  return parseProfile(payload.profile, input.environment)
}
