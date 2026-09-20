import {
  CUSTOMER_PASSWORD_REQUIREMENTS,
  validateCustomerPassword,
} from "../auth/password-policy.ts"
import { normalizeCheckoutEmail } from "../checkout.ts"
import { isAllowedCheckoutOrigin, resolvePublicSiteUrl } from "./env.ts"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RECOVERY_PATH = "/redefinir-senha"

interface AccountSignupInput {
  name: string
  email: string
  whatsapp: string
  password: string
  next: string
}

interface AccountConfirmationResendInput {
  email: string
  next: string
}

interface AccountLoginInput {
  email: string
  password: string
  next: string
}

interface AccountResetInput {
  email: string
}

interface AccountPasswordUpdateInput {
  password: string
}

interface AccountPasswordChangeInput extends AccountPasswordUpdateInput {
  currentPassword: string
}

interface AccountEmailChangeInput {
  email: string
  currentPassword: string
}

interface AccountProfileInput {
  name: string
  whatsapp: string
}

export interface AccountProfileMetadata {
  name: string
  whatsapp: string
}

export class CustomerPasswordPolicyError extends Error {
  constructor() {
    super(CUSTOMER_PASSWORD_REQUIREMENTS)
    this.name = "CustomerPasswordPolicyError"
  }
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

function validateCredentialPassword(value: unknown) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new Error("Invalid account request")
  }
  return value
}

function validateNewPassword(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("Invalid account request")
  }
  if (validateCustomerPassword(value)) {
    throw new CustomerPasswordPolicyError()
  }
  return value
}

export function parseAccountSignupInput(value: unknown): AccountSignupInput {
  const input = requireExactKeys(value, ["name", "email", "whatsapp", "password", "next"])
  return {
    name: normalizeName(input.name),
    email: normalizeEmail(input.email),
    whatsapp: normalizeWhatsapp(input.whatsapp),
    password: validateNewPassword(input.password),
    next: sanitizeCustomerLoginNext(typeof input.next === "string" ? input.next : undefined),
  }
}

export function parseAccountConfirmationResendInput(
  value: unknown,
): AccountConfirmationResendInput {
  const input = requireExactKeys(value, ["email", "next"])
  return {
    email: normalizeEmail(input.email),
    next: sanitizeCustomerLoginNext(typeof input.next === "string" ? input.next : undefined),
  }
}

export function parseAccountLoginInput(value: unknown): AccountLoginInput {
  const input = requireExactKeys(value, ["email", "password", "next"])
  return {
    email: normalizeEmail(input.email),
    password: validateCredentialPassword(input.password),
    next: sanitizeCustomerLoginNext(
      typeof input.next === "string" ? input.next : undefined,
    ),
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
  return { password: validateNewPassword(input.password) }
}

export function parseAccountPasswordChangeInput(
  value: unknown,
): AccountPasswordChangeInput {
  const input = requireExactKeys(value, ["currentPassword", "password"])
  return {
    currentPassword: validateCredentialPassword(input.currentPassword),
    password: validateNewPassword(input.password),
  }
}

export function parseAccountEmailChangeInput(
  value: unknown,
): AccountEmailChangeInput {
  const input = requireExactKeys(value, ["email", "currentPassword"])
  return {
    email: normalizeEmail(input.email),
    currentPassword: validateCredentialPassword(input.currentPassword),
  }
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
  try {
    const requestOrigin = new URL(request.url).origin
    const configuredSiteUrl = resolvePublicSiteUrl(requestOrigin)

    return isAllowedCheckoutOrigin({
      originHeader: request.headers.get("origin"),
      configuredSiteUrl,
      requestOrigin,
      nodeEnv: process.env.NODE_ENV,
    })
  } catch {
    return false
  }
}

export function sanitizeAccountNext(value: string | null | undefined) {
  if (value === PASSWORD_RECOVERY_PATH) return PASSWORD_RECOVERY_PATH
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
      parsed.pathname.startsWith("/minha-conta/") ||
      parsed.pathname === "/produtos" ||
      parsed.pathname === "/checkout"
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  } catch {
    return "/minha-conta"
  }

  return "/minha-conta"
}
