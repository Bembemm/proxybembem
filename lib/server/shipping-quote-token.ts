import { createHash, createHmac, timingSafeEqual } from "node:crypto"

export interface ShippingQuoteClaims {
  serviceId: string
  priceCents: number
  destinationCep: string
  cartFingerprint: string
  expiresAt: number
}

const QUOTE_TTL_MS = 10 * 60 * 1000
const MAX_TOKEN_LENGTH = 2048
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

function assertSecret(secret: string) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("Shipping quote secret must contain at least 32 characters")
  }
}

function isValidClaims(value: unknown): value is ShippingQuoteClaims {
  if (!value || typeof value !== "object") return false
  const claims = value as Partial<ShippingQuoteClaims>

  return (
    typeof claims.serviceId === "string" &&
    claims.serviceId.length > 0 &&
    claims.serviceId.length <= 100 &&
    typeof claims.priceCents === "number" &&
    Number.isSafeInteger(claims.priceCents) &&
    claims.priceCents > 0 &&
    typeof claims.destinationCep === "string" &&
    /^\d{8}$/.test(claims.destinationCep) &&
    typeof claims.cartFingerprint === "string" &&
    /^[a-f0-9]{64}$/.test(claims.cartFingerprint) &&
    typeof claims.expiresAt === "number" &&
    Number.isSafeInteger(claims.expiresAt) &&
    claims.expiresAt > 0
  )
}

export function createShippingQuoteToken(
  claims: Omit<ShippingQuoteClaims, "expiresAt">,
  secret: string,
  nowMs = Date.now(),
): string {
  assertSecret(secret)

  const completeClaims: ShippingQuoteClaims = {
    ...claims,
    expiresAt: nowMs + QUOTE_TTL_MS,
  }
  if (!isValidClaims(completeClaims)) {
    throw new Error("Invalid shipping quote claims")
  }

  const payload = Buffer.from(JSON.stringify(completeClaims), "utf8").toString("base64url")
  const signature = createHmac("sha256", secret).update(payload).digest("base64url")
  return `${payload}.${signature}`
}

export function verifyShippingQuoteToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): ShippingQuoteClaims | null {
  if (
    typeof token !== "string" ||
    token.length < 3 ||
    token.length > MAX_TOKEN_LENGTH ||
    typeof secret !== "string" ||
    secret.length < 32
  ) {
    return null
  }

  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [payload, signatureText] = parts
  if (
    !payload ||
    !signatureText ||
    !BASE64URL_PATTERN.test(payload) ||
    !BASE64URL_PATTERN.test(signatureText)
  ) {
    return null
  }

  let providedSignature: Buffer
  try {
    providedSignature = Buffer.from(signatureText, "base64url")
  } catch {
    return null
  }

  const expectedSignature = createHmac("sha256", secret).update(payload).digest()
  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return null
  }

  let claims: unknown
  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8")
    claims = JSON.parse(decoded)
  } catch {
    return null
  }

  if (!isValidClaims(claims)) return null
  if (nowMs > claims.expiresAt) return null
  return claims
}

export function createCartFingerprint(
  items: Array<{ productId: number; quantity: number }>,
): string {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    throw new Error("Invalid cart fingerprint input")
  }

  const normalized = items.map((item) => {
    if (
      !Number.isInteger(item.productId) ||
      item.productId <= 0 ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 20
    ) {
      throw new Error("Invalid cart fingerprint input")
    }
    return { productId: item.productId, quantity: item.quantity }
  })

  normalized.sort((a, b) => a.productId - b.productId)
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
}
