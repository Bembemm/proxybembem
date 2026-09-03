import assert from "node:assert/strict"
import test from "node:test"
import {
  ShippingUnavailableError,
  createShippingQuoteBuilder,
  formatShippingUnavailableMessage,
  toPublicShippingOptions,
} from "../lib/server/shipping-quote.ts"
import { MelhorEnvioProviderError } from "../lib/server/melhor-envio.ts"
import {
  createCartFingerprint,
  verifyShippingQuoteToken,
} from "../lib/server/shipping-quote-token.ts"

const QUOTE_SECRET = "12345678901234567890123456789012"

test("builds trusted mixed-product freight options and keeps provider packages server-side", async () => {
  let providerInput: unknown = null
  const buildShippingQuoteResult = createShippingQuoteBuilder({
    getQuoteSecret: () => QUOTE_SECRET,
    quoteProvider: async (input) => {
      providerInput = input
      return [
        {
          serviceId: "2",
          serviceName: "SEDEX",
          carrierName: "Correios",
          priceCents: 2990,
          deliveryDays: 2,
          packages: [{ id: "fast-volume" }],
        },
        {
          serviceId: "1",
          serviceName: "PAC",
          carrierName: "Correios",
          priceCents: 1842,
          deliveryDays: 6,
          packages: [{ id: "cheap-volume" }],
        },
      ]
    },
  })

  const result = await buildShippingQuoteResult({
    destinationCep: "01001-000",
    items: [
      {
        productId: 1,
        quantity: 1,
        price: 0.01,
        shipping: { weightKg: 0.001, widthCm: 1, heightCm: 1, lengthCm: 1 },
      },
      {
        productId: 2,
        quantity: 2,
        price: 0.01,
        shipping: { weightKg: 0.001, widthCm: 1, heightCm: 1, lengthCm: 1 },
      },
    ],
  })

  assert.deepEqual(providerInput, {
    destinationCep: "01001000",
    products: [
      {
        id: "1",
        widthCm: 19,
        heightCm: 4,
        lengthCm: 25,
        weightKg: 0.5,
        insuranceValue: 119.9,
        quantity: 1,
      },
      {
        id: "2",
        widthCm: 19,
        heightCm: 4,
        lengthCm: 25,
        weightKg: 0.5,
        insuranceValue: 69.99,
        quantity: 2,
      },
    ],
  })

  assert.equal(
    result.cartFingerprint,
    createCartFingerprint([
      { productId: 1, quantity: 1 },
      { productId: 2, quantity: 2 },
    ]),
  )
  assert.deepEqual(
    result.options.map(({ serviceId, priceCents, deliveryDays, packages }) => ({
      serviceId,
      priceCents,
      deliveryDays,
      packages,
    })),
    [
      {
        serviceId: "1",
        priceCents: 1842,
        deliveryDays: 6,
        packages: [{ id: "cheap-volume" }],
      },
      {
        serviceId: "2",
        priceCents: 2990,
        deliveryDays: 2,
        packages: [{ id: "fast-volume" }],
      },
    ],
  )

  const pacClaims = verifyShippingQuoteToken(result.options[0].quoteToken, QUOTE_SECRET)
  assert.ok(pacClaims)
  assert.equal(pacClaims.serviceId, "1")
  assert.equal(pacClaims.priceCents, 1842)
  assert.equal(pacClaims.destinationCep, "01001000")
  assert.equal(pacClaims.cartFingerprint, result.cartFingerprint)

  const publicOptions = toPublicShippingOptions(result)
  assert.equal("packages" in publicOptions[0], false)
  assert.deepEqual(publicOptions[0], {
    serviceId: "1",
    serviceName: "PAC",
    carrierName: "Correios",
    priceCents: 1842,
    deliveryDays: 6,
    quoteToken: result.options[0].quoteToken,
  })
})

test("rejects an invalid destination CEP before provider or secret work", async () => {
  let providerCalls = 0
  let secretCalls = 0
  const buildShippingQuoteResult = createShippingQuoteBuilder({
    getQuoteSecret: () => {
      secretCalls += 1
      return QUOTE_SECRET
    },
    quoteProvider: async () => {
      providerCalls += 1
      return []
    },
  })

  await assert.rejects(
    () => buildShippingQuoteResult({ destinationCep: "123", items: [{ productId: 1, quantity: 1 }] }),
    /CEP/,
  )
  assert.equal(providerCalls, 0)
  assert.equal(secretCalls, 0)
})

test("returns a controlled unavailable error when the provider has no valid services", async () => {
  const buildShippingQuoteResult = createShippingQuoteBuilder({
    getQuoteSecret: () => QUOTE_SECRET,
    quoteProvider: async () => [],
  })

  await assert.rejects(
    () =>
      buildShippingQuoteResult({
        destinationCep: "01001000",
        items: [{ productId: 1, quantity: 1 }],
      }),
    (error: unknown) => error instanceof ShippingUnavailableError,
  )
})

test("keeps shipping provider failures generic", async () => {
  const buildShippingQuoteResult = createShippingQuoteBuilder({
    getQuoteSecret: () => QUOTE_SECRET,
    quoteProvider: async () => {
      throw new MelhorEnvioProviderError(401)
    },
  })

  let providerError: ShippingUnavailableError | null = null
  try {
    await buildShippingQuoteResult({
      destinationCep: "01001000",
      items: [{ productId: 1, quantity: 1 }],
    })
  } catch (error) {
    assert.ok(error instanceof ShippingUnavailableError)
    providerError = error
  }

  assert.ok(providerError)
  const expected = "Não foi possível calcular o frete agora. Confira o CEP e tente novamente."
  assert.equal(formatShippingUnavailableMessage(providerError), expected)
})
