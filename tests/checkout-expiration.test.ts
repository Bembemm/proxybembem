import assert from "node:assert/strict"
import test from "node:test"
import {
  buildCheckoutExpirationWindow,
  canResumeCheckout,
  CHECKOUT_EXPIRATION_MS,
  checkoutExpiresAt,
  isCheckoutExpired,
} from "../lib/checkout-expiration.ts"

test("checkout expires exactly 72 hours after creation", () => {
  const createdAt = "2026-09-18T12:00:00.000Z"
  assert.equal(
    checkoutExpiresAt(createdAt).toISOString(),
    "2026-09-21T12:00:00.000Z",
  )

  const before = Date.parse(createdAt) + CHECKOUT_EXPIRATION_MS - 1
  const atExpiry = Date.parse(createdAt) + CHECKOUT_EXPIRATION_MS
  const input = {
    createdAt,
    paymentStatus: "pending",
    fulfillmentStatus: "awaiting_payment" as const,
  }

  assert.equal(isCheckoutExpired(input, before), false)
  assert.equal(canResumeCheckout(input, before), true)
  assert.equal(isCheckoutExpired(input, atExpiry), true)
  assert.equal(canResumeCheckout(input, atExpiry), false)
})

test("approved, processing, and canceled orders are never treated as abandoned checkout", () => {
  const now = Date.parse("2026-09-30T12:00:00.000Z")
  const createdAt = "2026-09-18T12:00:00.000Z"

  assert.equal(
    isCheckoutExpired(
      { createdAt, paymentStatus: "approved", fulfillmentStatus: "awaiting_production" },
      now,
    ),
    false,
  )
  assert.equal(
    isCheckoutExpired(
      { createdAt, paymentStatus: "in_process", fulfillmentStatus: "awaiting_payment" },
      now,
    ),
    false,
  )
  assert.equal(
    isCheckoutExpired(
      { createdAt, paymentStatus: "pending", fulfillmentStatus: "canceled" },
      now,
    ),
    false,
  )
})

test("Mercado Pago expiration window uses the same 72-hour policy", () => {
  const now = Date.parse("2026-09-18T12:00:00.000Z")
  assert.deepEqual(buildCheckoutExpirationWindow(now), {
    expirationDateFrom: "2026-09-18T12:00:00.000Z",
    expirationDateTo: "2026-09-21T12:00:00.000Z",
  })
})
