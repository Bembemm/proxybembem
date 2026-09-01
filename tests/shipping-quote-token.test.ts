import assert from "node:assert/strict"
import test from "node:test"
import {
  createCartFingerprint,
  createShippingQuoteToken,
  verifyShippingQuoteToken,
} from "../lib/server/shipping-quote-token.ts"

const SECRET = "12345678901234567890123456789012"
const NOW = 1_800_000_000_000

const claims = {
  serviceId: "1",
  priceCents: 1842,
  destinationCep: "01001000",
  cartFingerprint: "a".repeat(64),
}

test("creates and verifies a quote token with a ten minute lifetime", () => {
  const token = createShippingQuoteToken(claims, SECRET, NOW)
  assert.deepEqual(verifyShippingQuoteToken(token, SECRET, NOW + 9 * 60_000), {
    ...claims,
    expiresAt: NOW + 10 * 60_000,
  })
})

test("rejects expired quote tokens", () => {
  const token = createShippingQuoteToken(claims, SECRET, NOW)
  assert.equal(verifyShippingQuoteToken(token, SECRET, NOW + 10 * 60_000 + 1), null)
})

test("rejects signature, payload and secret tampering", () => {
  const token = createShippingQuoteToken(claims, SECRET, NOW)
  const [payload, signature] = token.split(".")
  assert.ok(payload)
  assert.ok(signature)

  const last = signature.at(-1) === "A" ? "B" : "A"
  assert.equal(
    verifyShippingQuoteToken(`${payload}.${signature.slice(0, -1)}${last}`, SECRET, NOW),
    null,
  )

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >
  decoded.priceCents = 1
  const changedPayload = Buffer.from(JSON.stringify(decoded)).toString("base64url")
  assert.equal(verifyShippingQuoteToken(`${changedPayload}.${signature}`, SECRET, NOW), null)
  assert.equal(verifyShippingQuoteToken(token, "x".repeat(32), NOW), null)
})

test("rejects malformed and oversized quote tokens", () => {
  assert.equal(verifyShippingQuoteToken("not-a-token", SECRET, NOW), null)
  assert.equal(verifyShippingQuoteToken("a".repeat(2049), SECRET, NOW), null)
  assert.equal(verifyShippingQuoteToken("@@@.@@@", SECRET, NOW), null)
})

test("creates a stable cart fingerprint independent of line order", () => {
  const first = createCartFingerprint([
    { productId: 2, quantity: 1 },
    { productId: 1, quantity: 3 },
  ])
  const second = createCartFingerprint([
    { productId: 1, quantity: 3 },
    { productId: 2, quantity: 1 },
  ])

  assert.equal(first, second)
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.notEqual(
    first,
    createCartFingerprint([
      { productId: 1, quantity: 2 },
      { productId: 2, quantity: 1 },
    ]),
  )
})
