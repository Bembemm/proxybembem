import type { CustomerIdentity } from "./customer-auth.ts"
import { getSupabaseEnv } from "./env.ts"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NIL_UUID = "00000000-0000-0000-0000-000000000000"
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ORDER_NUMBER_PATTERN = /^PB-[A-F0-9]{12}$/

export type ClaimGuestOrderResult =
  | {
      outcome: "claimed" | "already_claimed"
      orderId: string
      orderNumber: string
    }
  | { outcome: "not_claimable" }

export interface ClaimGuestOrderDependencies {
  claimOrder(input: {
    publicToken: string
    userId: string
    verifiedEmail: string
  }): Promise<unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  )
}

function normalizePublicToken(value: unknown) {
  if (typeof value !== "string") throw new Error("Invalid claim request")
  const publicToken = value.trim().toLowerCase()
  if (!TOKEN_PATTERN.test(publicToken)) throw new Error("Invalid claim request")
  return publicToken
}

function validateCustomer(customer: CustomerIdentity) {
  if (
    !customer ||
    customer.emailVerified !== true ||
    typeof customer.userId !== "string" ||
    !UUID_PATTERN.test(customer.userId) ||
    customer.userId.toLowerCase() === NIL_UUID ||
    customer.userId !== customer.userId.toLowerCase() ||
    typeof customer.email !== "string" ||
    customer.email.length === 0 ||
    customer.email.length > 254 ||
    customer.email !== customer.email.trim().toLowerCase() ||
    !EMAIL_PATTERN.test(customer.email)
  ) {
    throw new Error("Invalid customer identity")
  }
}

function parseClaimResult(value: unknown): ClaimGuestOrderResult {
  if (!isRecord(value)) throw new Error("Guest order claim returned an invalid response")

  if (
    value.outcome === "not_claimable" &&
    hasExactKeys(value, ["outcome"])
  ) {
    return { outcome: "not_claimable" }
  }

  if (
    (value.outcome === "claimed" || value.outcome === "already_claimed") &&
    hasExactKeys(value, ["outcome", "order_id", "order_number"]) &&
    typeof value.order_id === "string" &&
    UUID_PATTERN.test(value.order_id) &&
    value.order_id.toLowerCase() !== NIL_UUID &&
    typeof value.order_number === "string" &&
    ORDER_NUMBER_PATTERN.test(value.order_number)
  ) {
    return {
      outcome: value.outcome,
      orderId: value.order_id.toLowerCase(),
      orderNumber: value.order_number,
    }
  }

  throw new Error("Guest order claim returned an invalid response")
}

export function parseClaimGuestOrderInput(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ["publicToken"])) {
    throw new Error("Invalid claim request")
  }
  return { publicToken: normalizePublicToken(value.publicToken) }
}

export async function claimGuestOrderWithDependencies(
  input: {
    publicToken: string
    customer: CustomerIdentity
  },
  deps: ClaimGuestOrderDependencies,
): Promise<ClaimGuestOrderResult> {
  const publicToken = normalizePublicToken(input.publicToken)
  validateCustomer(input.customer)

  return parseClaimResult(
    await deps.claimOrder({
      publicToken,
      userId: input.customer.userId,
      verifiedEmail: input.customer.email,
    }),
  )
}

function createProductionDependencies(): ClaimGuestOrderDependencies {
  return {
    async claimOrder(input) {
      const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()
      const response = await fetch(
        `${supabaseUrl}/rest/v1/rpc/claim_guest_order_for_customer`,
        {
          method: "POST",
          headers: {
            apikey: supabaseSecretKey,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_public_token: input.publicToken,
            p_customer_id: input.userId,
            p_verified_email: input.verifiedEmail,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        },
      )

      if (!response.ok) {
        throw new Error("Guest order claim request failed")
      }
      return (await response.json()) as unknown
    },
  }
}

export async function claimGuestOrder(input: {
  publicToken: string
  customer: CustomerIdentity
}): Promise<ClaimGuestOrderResult> {
  return claimGuestOrderWithDependencies(input, createProductionDependencies())
}
