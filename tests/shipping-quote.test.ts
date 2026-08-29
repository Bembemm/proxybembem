import assert from "node:assert/strict"
import test from "node:test"
import {
  ShippingUnavailableError,
  buildShippingQuoteResult,
  formatShippingUnavailableMessage,
  toPublicShippingOptions,
} from "../lib/server/shipping-quote.ts"
import {
  createCartFingerprint,
  verifyShippingQuoteToken,
} from "../lib/server/shipping-quote-token.ts"

const ENV_KEYS = [
  "MELHOR_ENVIO_ENVIRONMENT",
  "MELHOR_ENVIO_ACCESS_TOKEN",
  "MELHOR_ENVIO_USER_AGENT",
  "SHIPPING_ORIGIN_CEP",
  "SHIPPING_QUOTE_SECRET",
] as const

const QUOTE_SECRET = "12345678901234567890123456789012"

async function withShippingEnv(run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])

  process.env.MELHOR_ENVIO_ENVIRONMENT = "sandbox"
  process.env.MELHOR_ENVIO_ACCESS_TOKEN = "provider-token"
  process.env.MELHOR_ENVIO_USER_AGENT = "ProxyBembem (contato@proxybembem.com.br)"
  process.env.SHIPPING_ORIGIN_CEP = "86730000"
  process.env.SHIPPING_QUOTE_SECRET = QUOTE_SECRET

  try {
    await run()
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test("builds trusted signed freight options and keeps provider packages server-side", async (t) => {
  await withShippingEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const payload = JSON.parse(String(init?.body)) as {
          products: Array<Record<string, unknown>>
        }

        assert.deepEqual(payload.products, [
          {
            id: "1",
            width: 19,
            height: 4,
            length: 25,
            weight: 0.25,
            insurance_value: 119.9,
            quantity: 2,
          },
        ])

        return new Response(
          JSON.stringify([
            {
              id: 2,
              name: "SEDEX",
              custom_price: "29.90",
              custom_delivery_time: 2,
              company: { name: "Correios" },
              packages: [{ id: "fast-volume" }],
            },
            {
              id: 1,
              name: "PAC",
              custom_price: "18.42",
              custom_delivery_time: 6,
              company: { name: "Correios" },
              packages: [{ id: "cheap-volume" }],
            },
          ]),
          { status: 200 },
        )
      },
    )

    const result = await buildShippingQuoteResult({
      destinationCep: "01001-000",
      items: [
        {
          productId: 1,
          quantity: 2,
          price: 0.01,
          shipping: { weightKg: 0.001, widthCm: 1, heightCm: 1, lengthCm: 1 },
        },
      ],
    })

    assert.equal(
      result.cartFingerprint,
      createCartFingerprint([{ productId: 1, quantity: 2 }]),
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
})

test("rejects an invalid destination CEP before provider work", async (t) => {
  await withShippingEnv(async () => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("[]"))

    await assert.rejects(
      () => buildShippingQuoteResult({ destinationCep: "123", items: [{ productId: 1, quantity: 1 }] }),
      /CEP/,
    )
    assert.equal(fetchMock.mock.callCount(), 0)
  })
})

test("returns a controlled unavailable error when the provider has no valid services", async (t) => {
  await withShippingEnv(async () => {
    t.mock.method(globalThis, "fetch", async () => new Response("[]", { status: 200 }))

    await assert.rejects(
      () =>
        buildShippingQuoteResult({
          destinationCep: "01001000",
          items: [{ productId: 1, quantity: 1 }],
        }),
      (error: unknown) => error instanceof ShippingUnavailableError,
    )
  })
})

test("classifies safe preview diagnostics without exposing them in production", async (t) => {
  await withShippingEnv(async () => {
    t.mock.method(globalThis, "fetch", async () => new Response("unauthorized", { status: 401 }))

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
    assert.equal(providerError.diagnosticCode, "provider_401")
    assert.match(formatShippingUnavailableMessage(providerError, "preview"), /provider_401/)
    assert.doesNotMatch(formatShippingUnavailableMessage(providerError, "production"), /provider_401/)
  })
})

test("classifies invalid Melhor Envio configuration as config", async () => {
  await withShippingEnv(async () => {
    delete process.env.MELHOR_ENVIO_ENVIRONMENT

    let configError: ShippingUnavailableError | null = null
    try {
      await buildShippingQuoteResult({
        destinationCep: "01001000",
        items: [{ productId: 1, quantity: 1 }],
      })
    } catch (error) {
      assert.ok(error instanceof ShippingUnavailableError)
      configError = error
    }

    assert.ok(configError)
    assert.equal(configError.diagnosticCode, "config")
  })
})
