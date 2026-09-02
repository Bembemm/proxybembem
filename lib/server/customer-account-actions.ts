import { normalizeCheckoutEmail } from "../checkout.ts"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PUBLIC_ORDER_PATH_RE = /^\/pedido\/[A-Fa-f0-9]{64}$/

interface AccountSignupInput {
  name: string
  email: string
  whatsapp: string
  password: string
}

interface AccountLoginInput {
  email: string
  password: string
}

interface AccountResetInput {
  email: string
}

interface AccountPasswordUpdateInput {
  password: string
}

interface AccountProfileInput {
  name: string
  whatsapp: string
}

export interface AccountProfileMetadata {
  name: string
  whatsapp: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function requireExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Invalid account request")

  const actualKeys = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  if (
    actualKeys.length !== expected.length ||
    actualKeys.some((key, index) => key !== expected[index])
  ) {
    throw new Error("Invalid account request")
  }

  return value
}

function normalizeName(value: unknown) {
  if (typeof value !== "string") throw new Error("Invalid account request")
  const name = value.trim().replace(/\s+/g, " ")
  if (name.length < 3 || name.length > 100) {
    throw new Error("Invalid account request")
  }
  return name
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") throw new Error("Invalid account request")
  const email = normalizeCheckoutEmail(value)
  if (email.length === 0 || email.length > 254 || !EMAIL_RE.test(email)) {
    throw new Error("Invalid account request")
  }
  return email
}

function normalizeWhatsapp(value: unknown) {
  if (typeof value !== "string") throw new Error("Invalid account request")
  const whatsapp = value.replace(/\D/g, "")
  if (!/^\d{10,11}$/.test(whatsapp)) {
    throw new Error("Invalid account request")
  }
  return whatsapp
}

function validatePassword(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new Error("Invalid account request")
  }
  return value
}

export function parseAccountSignupInput(value: unknown): AccountSignupInput {
  const input = requireExactKeys(value, ["name", "email", "whatsapp", "password"])
  return {
    name: normalizeName(input.name),
    email: normalizeEmail(input.email),
    whatsapp: normalizeWhatsapp(input.whatsapp),
    password: validatePassword(input.password),
  }
}

export function parseAccountLoginInput(value: unknown): AccountLoginInput {
  const input = requireExactKeys(value, ["email", "password"])
  return {
    email: normalizeEmail(input.email),
    password: validatePassword(input.password),
  }
}

export function parseAccountResetInput(value: unknown): AccountResetInput {
  const input = requireExactKeys(value, ["email"])
  return { email: normalizeEmail(input.email) }
}

export function parseAccountPasswordUpdateInput(
  value: unknown,
): AccountPasswordUpdateInput {
  const input = requireExactKeys(value, ["password"])
  return { password: validatePassword(input.password) }
}

export function parseAccountProfileInput(value: unknown): AccountProfileInput {
  const input = requireExactKeys(value, ["name", "whatsapp"])
  return {
    name: normalizeName(input.name),
    whatsapp: normalizeWhatsapp(input.whatsapp),
  }
}

export function parseAccountProfileMetadata(value: unknown): AccountProfileMetadata {
  if (!isRecord(value)) throw new Error("Invalid account profile metadata")
  return {
    name: normalizeName(value.name),
    whatsapp: normalizeWhatsapp(value.whatsapp),
  }
}

export function isSameOriginAccountRequest(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin) return false

  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export function sanitizeAccountNext(value: string | null | undefined) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/minha-conta"
  }
  if (value.includes("\\")) return "/minha-conta"

  try {
    const parsed = new URL(value, "https://account.local")
    if (parsed.origin !== "https://account.local") return "/minha-conta"
    if (
      parsed.pathname !== "/minha-conta" &&
      !parsed.pathname.startsWith("/minha-conta/")
    ) {
      return "/minha-conta"
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return "/minha-conta"
  }
}

export function sanitizeCustomerLoginNext(value: string | null | undefined) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/minha-conta"
  }
  if (value.includes("\\")) return "/minha-conta"

  try {
    const parsed = new URL(value, "https://account.local")
    if (parsed.origin !== "https://account.local") return "/minha-conta"

    if (
      parsed.pathname === "/minha-conta" ||
      parsed.pathname.startsWith("/minha-conta/")
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    }

    if (
      PUBLIC_ORDER_PATH_RE.test(parsed.pathname) &&
      parsed.search === "" &&
      parsed.hash === ""
    ) {
      return parsed.pathname
    }
  } catch {
    return "/minha-conta"
  }

  return "/minha-conta"
}
