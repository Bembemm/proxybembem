import type { FulfillmentStatus } from "./server/fulfillment.ts"

export const CHECKOUT_EXPIRATION_HOURS = 72
export const CHECKOUT_EXPIRATION_MS = CHECKOUT_EXPIRATION_HOURS * 60 * 60 * 1000

export interface CheckoutExpirationInput {
  createdAt: string
  paymentStatus: string
  fulfillmentStatus: FulfillmentStatus
}

export function checkoutExpiresAt(createdAt: string) {
  const createdAtMs = Date.parse(createdAt)
  if (!Number.isFinite(createdAtMs)) {
    throw new Error("Invalid checkout creation timestamp")
  }
  return new Date(createdAtMs + CHECKOUT_EXPIRATION_MS)
}

export function buildCheckoutExpirationWindow(nowMs: number) {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new Error("Invalid checkout clock")
  }

  const from = new Date(nowMs)
  const to = new Date(nowMs + CHECKOUT_EXPIRATION_MS)
  return {
    expirationDateFrom: from.toISOString(),
    expirationDateTo: to.toISOString(),
  }
}

export function isCheckoutExpired(
  input: CheckoutExpirationInput,
  nowMs = Date.now(),
) {
  if (
    input.paymentStatus !== "pending" ||
    input.fulfillmentStatus !== "awaiting_payment"
  ) {
    return false
  }

  return nowMs >= checkoutExpiresAt(input.createdAt).getTime()
}

export function canResumeCheckout(
  input: CheckoutExpirationInput,
  nowMs = Date.now(),
) {
  return (
    input.paymentStatus === "pending" &&
    input.fulfillmentStatus === "awaiting_payment" &&
    !isCheckoutExpired(input, nowMs)
  )
}
