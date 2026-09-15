import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  normalizeCheckoutData,
  validateCheckout,
  type CheckoutData,
  type CheckoutErrors,
} from "../lib/checkout.ts"
import { createCheckoutFingerprint } from "../lib/server/checkout-idempotency.ts"
import type { ShippingQuoteClaims } from "../lib/server/shipping-quote-token.ts"

const validCustomer = {
  nome: "Cliente Teste",
  email: " Cliente+Deck@Example.COM ",
  whatsapp: "44999999999",
  cep: "87000000",
  rua: "Rua A",
  numero: "10",
  complemento: "",
  bairro: "Centro",
  cidade: "Maringá",
  uf: "PR",
} as CheckoutData & { email: string }

const quoteClaims: ShippingQuoteClaims = {
  serviceId: "1",
  priceCents: 1842,
  destinationCep: "87000000",
  cartFingerprint: "a".repeat(64),
  expiresAt: 1_900_000_000_000,
}

test("normalizes and validates mandatory checkout email", () => {
  const normalized = normalizeCheckoutData(validCustomer) as CheckoutData & { email?: string }
  const validErrors = validateCheckout(validCustomer) as CheckoutErrors & { email?: string }
  const invalidErrors = validateCheckout({
    ...validCustomer,
    email: "email-invalido",
  } as CheckoutData) as CheckoutErrors & { email?: string }
  const missingErrors = validateCheckout({
    ...validCustomer,
    email: "",
  } as CheckoutData) as CheckoutErrors & { email?: string }

  assert.equal(normalized.email, "cliente+deck@example.com")
  assert.equal(validErrors.email, undefined)
  assert.ok(invalidErrors.email)
  assert.ok(missingErrors.email)
})

test("checkout fingerprint includes normalized email but ignores case and outer whitespace", () => {
  const base = createCheckoutFingerprint({
    cartFingerprint: "b".repeat(64),
    customer: validCustomer,
    quoteClaims,
  })
  const sameNormalizedEmail = createCheckoutFingerprint({
    cartFingerprint: "b".repeat(64),
    customer: {
      ...validCustomer,
      email: "cliente+deck@example.com",
    } as CheckoutData,
    quoteClaims,
  })
  const differentEmail = createCheckoutFingerprint({
    cartFingerprint: "b".repeat(64),
    customer: {
      ...validCustomer,
      email: "outro@example.com",
    } as CheckoutData,
    quoteClaims,
  })

  assert.equal(base, sameNormalizedEmail)
  assert.notEqual(base, differentEmail)
})

test("checkout UI requires an accessible email field and stores it in checkout state", async () => {
  const [form, checkoutPage] = await Promise.all([
    readFile(new URL("../components/checkout-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/checkout-page.tsx", import.meta.url), "utf8"),
  ])

  assert.match(form, /type=["']email["']/)
  assert.match(form, /autoComplete=["']email["']/)
  assert.match(form, /errors\.email/)
  assert.match(form, /email/i)
  assert.match(checkoutPage, /email:\s*["']["']/)
  assert.match(checkoutPage, /<CheckoutForm\s+data=\{checkout\}/)
})

test("checkout API parses email as a strict customer string field", async () => {
  const route = await readFile(new URL("../app/api/checkout/route.ts", import.meta.url), "utf8")

  assert.match(route, /["']email["']/)
  assert.match(route, /fieldErrors/)
})
