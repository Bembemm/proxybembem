import assert from "node:assert/strict"
import test from "node:test"

type Environment = "sandbox" | "production"
type TokenOptions = {
  forceRefresh?: boolean
  rejectedTokenVersion?: number
}
type QuoterDependencies = {
  getConfig(): {
    environment: Environment
    userAgent: string
    originCep: string
  }
  getAccessToken(options?: TokenOptions): Promise<{
    accessToken: string
    tokenVersion: number
  }>
}
type ShippingProductInput = {
  id: string
  widthCm: number
  heightCm: number
  lengthCm: number
  weightKg: number
  insuranceValue: number
  quantity: number
}
type QuoteInput = {
  destinationCep: string
  products: ShippingProductInput[]
}
type QuoteResult = Array<{
  serviceId: string
  serviceName: string
  carrierName: string
  priceCents: number
  deliveryDays: number
  packages: unknown[]
}>
type CreateQuoter = (deps: QuoterDependencies) => (input: QuoteInput) => Promise<QuoteResult>

async function loadCreateQuoter(): Promise<CreateQuoter> {
  const module = (await import("../lib/server/melhor-envio.ts")) as Record<string, unknown>
  assert.equal(
    typeof module.createMelhorEnvioQuoter,
    "function",
    "createMelhorEnvioQuoter must exist so token rotation can be tested deterministically",
  )
  return module.createMelhorEnvioQuoter as CreateQuoter
}

function config(environment: Environment = "sandbox") {
  return {
    environment,
    userAgent: "ProxyBembem (contato@proxybembem.com.br)",
    originCep: "86730000",
  }
}

const products: ShippingProductInput[] = [
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

function successQuote() {
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
}

test("quotes sandbox freight with a token-manager credential and trusted product payload", async (t) => {
  const tokenCalls: Array<TokenOptions | undefined> = []
  const createQuoter = await loadCreateQuoter()
  const quote = createQuoter({
    getConfig: () => config("sandbox"),
    getAccessToken: async (options) => {
      tokenCalls.push(options)
      return { accessToken: "token-v7", tokenVersion: 7 }
    },
  })

  t.mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      assert.equal(
        String(input),
        "https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate",
      )
      const headers = new Headers(init?.headers)
      assert.equal(headers.get("authorization"), "Bearer token-v7")
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
      return successQuote()
    },
  )

  assert.deepEqual(await quote({ destinationCep: "01001000", products }), [
    {
      serviceId: "1",
      serviceName: "PAC",
      carrierName: "Correios",
      priceCents: 1842,
      deliveryDays: 6,
      packages: [{ price: "18.42" }],
    },
  ])
  assert.deepEqual(tokenCalls, [undefined])
})

test("uses the production freight host with the token manager", async (t) => {
  const createQuoter = await loadCreateQuoter()
  const quote = createQuoter({
    getConfig: () => config("production"),
    getAccessToken: async () => ({ accessToken: "production-token", tokenVersion: 3 }),
  })

  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    assert.equal(
      String(input),
      "https://melhorenvio.com.br/api/v2/me/shipment/calculate",
    )
    return new Response("[]", { status: 200 })
  })

  assert.deepEqual(await quote({ destinationCep: "01001000", products }), [])
})

test("filters provider errors and invalid quote entries", async (t) => {
  const createQuoter = await loadCreateQuoter()
  const quote = createQuoter({
    getConfig: () => config(),
    getAccessToken: async () => ({ accessToken: "token-v7", tokenVersion: 7 }),
  })

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

  assert.deepEqual(await quote({ destinationCep: "01001000", products }), [
    {
      serviceId: "4",
      serviceName: "SEDEX",
      carrierName: "Correios",
      priceCents: 2990,
      deliveryDays: 2,
      packages: [],
    },
  ])
})

test("401 forces exactly one refresh that rejects the failed token version", async (t) => {
  const tokenCalls: Array<TokenOptions | undefined> = []
  const createQuoter = await loadCreateQuoter()
  const quote = createQuoter({
    getConfig: () => config(),
    getAccessToken: async (options) => {
      tokenCalls.push(options)
      return tokenCalls.length === 1
        ? { accessToken: "token-v7", tokenVersion: 7 }
        : { accessToken: "token-v8", tokenVersion: 8 }
    },
  })

  let providerCalls = 0
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      providerCalls += 1
      const auth = new Headers(init?.headers).get("authorization")
      if (providerCalls === 1) {
        assert.equal(auth, "Bearer token-v7")
        return Response.json({ message: "Unauthenticated." }, { status: 401 })
      }
      assert.equal(auth, "Bearer token-v8")
      return successQuote()
    },
  )

  const result = await quote({ destinationCep: "01001000", products })
  assert.equal(result[0]?.priceCents, 1842)
  assert.equal(providerCalls, 2)
  assert.deepEqual(tokenCalls, [
    undefined,
    { forceRefresh: true, rejectedTokenVersion: 7 },
  ])
})

test("the documented Unauthenticated message can recover once even when status is not 401", async (t) => {
  const tokenCalls: Array<TokenOptions | undefined> = []
  const createQuoter = await loadCreateQuoter()
  const quote = createQuoter({
    getConfig: () => config(),
    getAccessToken: async (options) => {
      tokenCalls.push(options)
      return tokenCalls.length === 1
        ? { accessToken: "token-v7", tokenVersion: 7 }
        : { accessToken: "token-v8", tokenVersion: 8 }
    },
  })

  let providerCalls = 0
  t.mock.method(globalThis, "fetch", async () => {
    providerCalls += 1
    return providerCalls === 1
      ? Response.json({ message: "Unauthenticated." }, { status: 403 })
      : successQuote()
  })

  await quote({ destinationCep: "01001000", products })
  assert.equal(providerCalls, 2)
  assert.deepEqual(tokenCalls[1], {
    forceRefresh: true,
    rejectedTokenVersion: 7,
  })
})

test("two authentication failures stop after one forced refresh with no retry loop", async (t) => {
  const tokenCalls: Array<TokenOptions | undefined> = []
  const createQuoter = await loadCreateQuoter()
  const quote = createQuoter({
    getConfig: () => config(),
    getAccessToken: async (options) => {
      tokenCalls.push(options)
      return tokenCalls.length === 1
        ? { accessToken: "token-v7-secret", tokenVersion: 7 }
        : { accessToken: "token-v8-secret", tokenVersion: 8 }
    },
  })

  let providerCalls = 0
  t.mock.method(globalThis, "fetch", async () => {
    providerCalls += 1
    return Response.json(
      { message: "Unauthenticated. token-v8-secret must never escape" },
      { status: 401 },
    )
  })

  await assert.rejects(
    () => quote({ destinationCep: "01001000", products }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /Melhor Envio request failed/)
      assert.doesNotMatch(error.message, /token-v7-secret|token-v8-secret|Unauthenticated/)
      return true
    },
  )
  assert.equal(providerCalls, 2)
  assert.deepEqual(tokenCalls, [
    undefined,
    { forceRefresh: true, rejectedTokenVersion: 7 },
  ])
})

test("permission and ordinary provider failures never trigger token refresh", async (t) => {
  for (const response of [
    () => Response.json({ message: "This action is unauthorized." }, { status: 403 }),
    () => Response.json({ message: "validation failed" }, { status: 422 }),
    () => Response.json({ message: "provider down" }, { status: 500 }),
  ]) {
    const tokenCalls: Array<TokenOptions | undefined> = []
    const createQuoter = await loadCreateQuoter()
    const quote = createQuoter({
      getConfig: () => config(),
      getAccessToken: async (options) => {
        tokenCalls.push(options)
        return { accessToken: "token-secret", tokenVersion: 7 }
      },
    })

    let providerCalls = 0
    t.mock.method(globalThis, "fetch", async () => {
      providerCalls += 1
      return response()
    })

    await assert.rejects(
      () => quote({ destinationCep: "01001000", products }),
      /Melhor Envio request failed/,
    )
    assert.equal(providerCalls, 1)
    assert.deepEqual(tokenCalls, [undefined])
    t.mock.restoreAll()
  }
})

test("network failures are sanitized and never force a refresh", async (t) => {
  const tokenCalls: Array<TokenOptions | undefined> = []
  const createQuoter = await loadCreateQuoter()
  const quote = createQuoter({
    getConfig: () => config(),
    getAccessToken: async (options) => {
      tokenCalls.push(options)
      return { accessToken: "network-token-secret", tokenVersion: 9 }
    },
  })

  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("network-token-secret leaked by transport")
  })

  await assert.rejects(
    () => quote({ destinationCep: "01001000", products }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /Melhor Envio request failed/)
      assert.doesNotMatch(error.message, /network-token-secret|leaked by transport/)
      return true
    },
  )
  assert.deepEqual(tokenCalls, [undefined])
})
