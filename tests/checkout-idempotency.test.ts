import assert from "node:assert/strict"
import test from "node:test"
import type { CheckoutData } from "../lib/checkout.ts"
import {
  createCheckoutFingerprint,
  parseCheckoutAttemptId,
} from "../lib/server/checkout-idempotency.ts"
import type { ShippingQuoteClaims } from "../lib/server/shipping-quote-token.ts"

const customer: CheckoutData = {
  nome: "Breno Bembem",
  email: "breno@example.com",
  whatsapp: "44991250332",
  cep: "86730000",
  rua: "Rua das Cartas",
  numero: "123",
  complemento: "",
  bairro: "Centro",
  cidade: "Astorga",
  uf: "PR",
}

const quoteClaims: ShippingQuoteClaims = {
  serviceId: "1",
  priceCents: 1842,
  destinationCep: "86730000",
  cartFingerprint: "a".repeat(64),
  expiresAt: 1_900_000_000_000,
}

test("normalizes canonical checkout attempt UUIDs and rejects invalid values", () => {
  assert.equal(
    parseCheckoutAttemptId("550E8400-E29B-41D4-A716-446655440000"),
    "550e8400-e29b-41d4-a716-446655440000",
  )
  assert.equal(parseCheckoutAttemptId("00000000-0000-0000-0000-000000000000"), null)
  assert.equal(parseCheckoutAttemptId("not-a-uuid"), null)
  assert.equal(parseCheckoutAttemptId("a".repeat(200)), null)
  assert.equal(parseCheckoutAttemptId(123), null)
})

test("creates a stable checkout fingerprint from trusted normalized fields", () => {
  const input = { cartFingerprint: "b".repeat(64), customer, quoteClaims }
  const first = createCheckoutFingerprint(input)
  const second = createCheckoutFingerprint(input)

  assert.equal(first, second)
  assert.match(first, /^[a-f0-9]{64}$/)
})

test("fingerprint changes when cart, address or selected shipping changes", () => {
  const base = createCheckoutFingerprint({
    cartFingerprint: "b".repeat(64),
    customer,
    quoteClaims,
  })

  assert.notEqual(
    base,
    createCheckoutFingerprint({
      cartFingerprint: "c".repeat(64),
      customer,
      quoteClaims,
    }),
  )
  assert.notEqual(
    base,
    createCheckoutFingerprint({
      cartFingerprint: "b".repeat(64),
      customer: { ...customer, numero: "124" },
      quoteClaims,
    }),
  )
  assert.notEqual(
    base,
    createCheckoutFingerprint({
      cartFingerprint: "b".repeat(64),
      customer,
      quoteClaims: { ...quoteClaims, serviceId: "2" },
    }),
  )
  assert.notEqual(
    base,
    createCheckoutFingerprint({
      cartFingerprint: "b".repeat(64),
      customer,
      quoteClaims: { ...quoteClaims, priceCents: 1942 },
    }),
  )
  assert.notEqual(
    base,
    createCheckoutFingerprint({
      cartFingerprint: "b".repeat(64),
      customer,
      quoteClaims: { ...quoteClaims, destinationCep: "01001000" },
    }),
  )
})

test("quote expiry timestamp does not change checkout identity", () => {
  const first = createCheckoutFingerprint({
    cartFingerprint: "b".repeat(64),
    customer,
    quoteClaims,
  })
  const second = createCheckoutFingerprint({
    cartFingerprint: "b".repeat(64),
    customer,
    quoteClaims: { ...quoteClaims, expiresAt: quoteClaims.expiresAt + 60_000 },
  })

  assert.equal(first, second)
})
