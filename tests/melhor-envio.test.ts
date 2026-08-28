import assert from "node:assert/strict"
import test from "node:test"
import { quoteMelhorEnvio } from "../lib/server/melhor-envio.ts"

const ENV_KEYS = [
  "MELHOR_ENVIO_ENVIRONMENT",
  "MELHOR_ENVIO_ACCESS_TOKEN",
  "MELHOR_ENVIO_USER_AGENT",
  "SHIPPING_ORIGIN_CEP",
  "SHIPPING_QUOTE_SECRET",
] as const

async function withProviderEnv(
  environment: "sandbox" | "production",
  run: () => Promise<void>,
) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])

  process.env.MELHOR_ENVIO_ENVIRONMENT = environment
  process.env.MELHOR_ENVIO_ACCESS_TOKEN = "secret-provider-token"
  process.env.MELHOR_ENVIO_USER_AGENT = "ProxyBembem (contato@proxybembem.com.br)"
  process.env.SHIPPING_ORIGIN_CEP = "86730000"
  process.env.SHIPPING_QUOTE_SECRET = "12345678901234567890123456789012"

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

const products = [
  {
    id: "1",
    widthCm: 19,
    heightCm: 4,
    lengthCm: 25,
    weightKg: 0.25,
    insuranceValue: 119.9,
    quantity: 2,
  },
]

test("quotes sandbox freight with required headers and trusted product payload", async (t) => {
  await withProviderEnv("sandbox", async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        assert.equal(
          String(input),
          "https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate",
        )

        const headers = new Headers(init?.headers)
        assert.equal(headers.get("authorization"), "Bearer secret-provider-token")
        assert.equal(headers.get("accept"), "application/json")
        assert.equal(headers.get("content-type"), "application/json")
        assert.equal(headers.get("user-agent"), "ProxyBembem (contato@proxybembem.com.br)")

        assert.deepEqual(JSON.parse(String(init?.body)), {
          from: { postal_code: "86730000" },
          to: { postal_code: "01001000" },
          products: [
            {
              id: "1",
              width: 19,
              height: 4,
              length: 25,
              weight: 0.25,
              insurance_value: 119.9,
              quantity: 2,
            },
          ],
          options: { receipt: false, own_hand: false },
        })

        return new Response(
          JSON.stringify([
            {
              id: 1,
              name: "PAC",
              custom_price: "18.42",
              custom_delivery_time: 6,
              company: { name: "Correios" },
              packages: [{ price: "18.42" }],
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      },
    )

    const result = await quoteMelhorEnvio({
      destinationCep: "01001000",
      products,
    })

    assert.deepEqual(result, [
      {
        serviceId: "1",
        serviceName: "PAC",
        carrierName: "Correios",
        priceCents: 1842,
        deliveryDays: 6,
        packages: [{ price: "18.42" }],
      },
    ])
  })
})

test("uses production base URL in production environment", async (t) => {
  await withProviderEnv("production", async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0]) => {
        assert.equal(
          String(input),
          "https://melhorenvio.com.br/api/v2/me/shipment/calculate",
        )
        return new Response("[]", { status: 200 })
      },
    )

    assert.deepEqual(
      await quoteMelhorEnvio({ destinationCep: "01001000", products }),
      [],
    )
  })
})

test("filters provider errors and invalid quote entries", async (t) => {
  await withProviderEnv("sandbox", async () => {
    t.mock.method(globalThis, "fetch", async () =>
      new Response(
        JSON.stringify([
          { id: 1, name: "PAC", error: "service unavailable" },
          {
            id: 2,
            name: "Invalid price",
            custom_price: "0",
            custom_delivery_time: 3,
            company: { name: "Carrier" },
          },
          {
            id: 3,
            name: "Invalid days",
            custom_price: "10.00",
            custom_delivery_time: -1,
            company: { name: "Carrier" },
          },
          {
            id: 4,
            name: "SEDEX",
            custom_price: "29.90",
            custom_delivery_time: 2,
            company: { name: "Correios" },
            packages: [],
          },
        ]),
        { status: 200 },
      ),
    )

    assert.deepEqual(
      await quoteMelhorEnvio({ destinationCep: "01001000", products }),
      [
        {
          serviceId: "4",
          serviceName: "SEDEX",
          carrierName: "Correios",
          priceCents: 2990,
          deliveryDays: 2,
          packages: [],
        },
      ],
    )
  })
})

test("throws a safe provider error for non-success responses", async (t) => {
  await withProviderEnv("sandbox", async () => {
    t.mock.method(globalThis, "fetch", async () =>
      new Response(JSON.stringify({ message: "token secret-provider-token invalid" }), {
        status: 401,
      }),
    )

    await assert.rejects(
      () => quoteMelhorEnvio({ destinationCep: "01001000", products }),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /Melhor Envio request failed/)
        assert.doesNotMatch(error.message, /secret-provider-token/)
        return true
      },
    )
  })
})
