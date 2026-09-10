import assert from "node:assert/strict"
import test from "node:test"

type Environment = "sandbox" | "production"
type TokenOptions = {
  forceRefresh?: boolean
  rejectedTokenVersion?: number
  requiredScopes?: readonly string[]
}
type Dependencies = {
  getConfig(): {
    environment: Environment
    userAgent: string
  }
  getAccessToken(options?: TokenOptions): Promise<{
    accessToken: string
    tokenVersion: number
    authorizedScopes: string[]
  }>
}
type Sender = {
  fullName: string
  cpf: string
  email: string
  phone: string
  postalCode: string
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
}
type Snapshot = {
  service: { id: string; name: string; carrier: string }
  recipient: {
    name: string
    email: string
    phone: string
    document: string
    postalCode: string
    street: string
    number: string
    complement: string | null
    neighborhood: string
    city: string
    state: string
  }
  package: {
    height: number
    width: number
    length: number
    weight: number
    insuranceValueCents: number
  }
  declarationItems: Array<{
    productId: number
    description: string
    quantity: number
    unitValueCents: number
  }>
  declarationValueCents: number
}
type Client = {
  addShipmentToMelhorEnvioCart(input: {
    sender: Sender
    snapshot: Snapshot
    documentMode: "declaration_content"
  }): Promise<{ providerShipmentId: string; currentCostCents: number }>
  purchaseMelhorEnvioShipment(input: {
    providerShipmentId: string
    currentCostCents: number
  }): Promise<{ providerOrderId: string; purchasedCostCents: number }>
  generateMelhorEnvioShipment(input: {
    providerShipmentId: string
  }): Promise<{ accepted: true }>
  readMelhorEnvioShipment(input: {
    providerShipmentId: string
    source: "cart" | "order"
  }): Promise<{
    providerShipmentId: string
    status: string | null
    priceCents: number | null
    trackingCode: string | null
    trackingUrl: string | null
  }>
  getMelhorEnvioPrintResource(input: {
    providerShipmentId: string
  }): Promise<{ url: string }>
  getMelhorEnvioDaceResource(input: {
    providerShipmentId: string
    format: "pdf" | "jpeg" | "zpl"
  }): Promise<{ url: string }>
  trackMelhorEnvioShipments(input: {
    providerShipmentIds: string[]
  }): Promise<Array<{
    providerShipmentId: string
    status: string
    trackingCode: string | null
    trackingUrl: string | null
  }>>
  cancelMelhorEnvioShipment(input: {
    providerShipmentId: string
    description: string
  }): Promise<{ providerShipmentId: string; canceled: true }>
}
type ProviderErrorConstructor = new (...args: never[]) => Error & {
  status: number | null
  classification:
    | "unauthenticated"
    | "definite_rejection"
    | "outcome_unknown"
    | "invalid_response"
}
type ShipmentClientModule = {
  createMelhorEnvioShipmentClient(deps: Dependencies): Client
  MelhorEnvioShipmentProviderError: ProviderErrorConstructor
}

const SHIPMENT_ID = "6e1c864a-fe48-4ae7-baaa-d6e4888bafd1"
const SHIPMENT_ID_2 = "6e1c864a-fe48-4ae7-baaa-d6e4888bafd2"
const USER_AGENT = "ProxyBembem (contato@proxybembem.com.br)"

async function loadModule(): Promise<ShipmentClientModule> {
  const path = "../lib/server/melhor-envio-shipment-client.ts"
  const module = (await import(path)) as Record<string, unknown>
  assert.equal(typeof module.createMelhorEnvioShipmentClient, "function")
  assert.equal(typeof module.MelhorEnvioShipmentProviderError, "function")
  return module as unknown as ShipmentClientModule
}

function config(environment: Environment = "sandbox") {
  return { environment, userAgent: USER_AGENT }
}

function token(accessToken = "token-v7", tokenVersion = 7) {
  return {
    accessToken,
    tokenVersion,
    authorizedScopes: [
      "shipping-calculate",
      "cart-read",
      "cart-write",
      "orders-read",
      "shipping-checkout",
      "shipping-generate",
      "shipping-print",
      "shipping-tracking",
      "shipping-cancel",
    ],
  }
}

function dependencies(
  tokenCalls: Array<TokenOptions | undefined> = [],
  environment: Environment = "sandbox",
): Dependencies {
  return {
    getConfig: () => config(environment),
    getAccessToken: async (options) => {
      tokenCalls.push(options)
      return token()
    },
  }
}

const sender: Sender = {
  fullName: "Breno Bembem",
  cpf: "52998224725",
  email: "contato@proxybembem.com.br",
  phone: "11987654321",
  postalCode: "86730000",
  street: "Rua do Remetente",
  number: "123",
  complement: "Sala 2",
  neighborhood: "Centro",
  city: "Astorga",
  state: "PR",
}

const snapshot: Snapshot = {
  service: { id: "3", name: ".Package", carrier: "Jadlog" },
  recipient: {
    name: "Cliente Teste",
    email: "cliente@example.com",
    phone: "11999999999",
    document: "52998224725",
    postalCode: "01001000",
    street: "Praça da Sé",
    number: "100",
    complement: null,
    neighborhood: "Sé",
    city: "São Paulo",
    state: "SP",
  },
  package: {
    height: 4,
    width: 19,
    length: 25,
    weight: 0.25,
    insuranceValueCents: 11990,
  },
  declarationItems: [
    {
      productId: 1,
      description: "Proxy de Magic: The Gathering – Alta Qualidade",
      quantity: 1,
      unitValueCents: 11990,
    },
  ],
  declarationValueCents: 11990,
}

function assertCommonHeaders(init: RequestInit | undefined, accessToken = "token-v7") {
  const headers = new Headers(init?.headers)
  assert.equal(headers.get("authorization"), `Bearer ${accessToken}`)
  assert.equal(headers.get("accept"), "application/json")
  assert.equal(headers.get("content-type"), "application/json")
  assert.equal(headers.get("user-agent"), USER_AGENT)
  assert.equal(init?.cache, "no-store")
  assert.ok(init?.signal instanceof AbortSignal)
}

function assertProviderError(
  error: unknown,
  ProviderError: ProviderErrorConstructor,
  classification: InstanceType<ProviderErrorConstructor>["classification"],
  status: number | null,
) {
  assert.ok(error instanceof ProviderError)
  assert.equal(error.classification, classification)
  assert.equal(error.status, status)
  assert.equal(error.message, "Melhor Envio shipment request failed")
  return true
}

test("cart insertion uses the trusted PF declaration payload, saved one-volume package and cart-write only", async (t) => {
  const module = await loadModule()
  const tokenCalls: Array<TokenOptions | undefined> = []
  const client = module.createMelhorEnvioShipmentClient(dependencies(tokenCalls))

  t.mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      assert.equal(String(input), "https://sandbox.melhorenvio.com.br/api/v2/me/cart")
      assert.equal(init?.method, "POST")
      assertCommonHeaders(init)
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      assert.deepEqual(body, {
        service: 3,
        from: {
          name: "Breno Bembem",
          email: "contato@proxybembem.com.br",
          phone: "11987654321",
          document: "52998224725",
          state_register: "ISENTO",
          address: "Rua do Remetente",
          complement: "Sala 2",
          number: "123",
          district: "Centro",
          city: "Astorga",
          postal_code: "86730000",
          state_abbr: "PR",
          country_id: "BR",
        },
        to: {
          name: "Cliente Teste",
          email: "cliente@example.com",
          phone: "11999999999",
          document: "52998224725",
          address: "Praça da Sé",
          complement: "",
          number: "100",
          district: "Sé",
          city: "São Paulo",
          postal_code: "01001000",
          state_abbr: "SP",
          country_id: "BR",
        },
        products: [
          {
            name: "Proxy de Magic: The Gathering – Alta Qualidade",
            quantity: 1,
            unitary_value: 119.9,
          },
        ],
        volumes: [{ height: 4, width: 19, length: 25, weight: 0.25 }],
        options: {
          insurance_value: 119.9,
          receipt: false,
          own_hand: false,
          reverse: false,
        },
      })
      assert.equal("invoice" in (body.options as Record<string, unknown>), false)
      return Response.json({ id: SHIPMENT_ID, price: "18.42" }, { status: 201 })
    },
  )

  assert.deepEqual(
    await client.addShipmentToMelhorEnvioCart({
      sender,
      snapshot,
      documentMode: "declaration_content",
    }),
    { providerShipmentId: SHIPMENT_ID, currentCostCents: 1842 },
  )
  assert.deepEqual(tokenCalls, [{ requiredScopes: ["cart-write"] }])
})

test("cart success parsing rejects missing ids, malformed money and oversized provider strings", async (t) => {
  const module = await loadModule()
  const badBodies = [
    { price: "18.42" },
    { id: SHIPMENT_ID, price: "18.421" },
    { id: "x".repeat(257), price: "18.42" },
  ]

  for (const body of badBodies) {
    const client = module.createMelhorEnvioShipmentClient(dependencies())
    t.mock.method(globalThis, "fetch", async () => Response.json(body, { status: 201 }))
    await assert.rejects(
      () =>
        client.addShipmentToMelhorEnvioCart({
          sender,
          snapshot,
          documentMode: "declaration_content",
        }),
      (error: unknown) =>
        assertProviderError(error, module.MelhorEnvioShipmentProviderError, "invalid_response", 201),
    )
    t.mock.restoreAll()
  }
})

test("recognized authentication failure refreshes exactly once with the same endpoint scope", async (t) => {
  const module = await loadModule()
  const tokenCalls: Array<TokenOptions | undefined> = []
  const client = module.createMelhorEnvioShipmentClient({
    getConfig: () => config(),
    getAccessToken: async (options) => {
      tokenCalls.push(options)
      return tokenCalls.length === 1 ? token("token-v7", 7) : token("token-v8", 8)
    },
  })
  let providerCalls = 0

  t.mock.method(
    globalThis,
    "fetch",
    async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      providerCalls += 1
      if (providerCalls === 1) {
        assertCommonHeaders(init, "token-v7")
        return Response.json({ message: "Unauthenticated." }, { status: 401 })
      }
      assertCommonHeaders(init, "token-v8")
      return Response.json({ id: SHIPMENT_ID, price: "18.42" }, { status: 201 })
    },
  )

  await client.addShipmentToMelhorEnvioCart({ sender, snapshot, documentMode: "declaration_content" })
  assert.equal(providerCalls, 2)
  assert.deepEqual(tokenCalls, [
    { requiredScopes: ["cart-write"] },
    {
      forceRefresh: true,
      rejectedTokenVersion: 7,
      requiredScopes: ["cart-write"],
    },
  ])
})

test("cart network and ambiguous server failures are outcome_unknown and are never retried blindly", async (t) => {
  const module = await loadModule()

  for (const response of ["network", "server"] as const) {
    const tokenCalls: Array<TokenOptions | undefined> = []
    const client = module.createMelhorEnvioShipmentClient(dependencies(tokenCalls))
    let providerCalls = 0
    t.mock.method(globalThis, "fetch", async () => {
      providerCalls += 1
      if (response === "network") throw new Error("transport detail must stay private")
      return Response.json({ message: "provider uncertain" }, { status: 503 })
    })

    await assert.rejects(
      () =>
        client.addShipmentToMelhorEnvioCart({
          sender,
          snapshot,
          documentMode: "declaration_content",
        }),
      (error: unknown) =>
        assertProviderError(
          error,
          module.MelhorEnvioShipmentProviderError,
          "outcome_unknown",
          response === "server" ? 503 : null,
        ),
    )
    assert.equal(providerCalls, 1)
    assert.deepEqual(tokenCalls, [{ requiredScopes: ["cart-write"] }])
    t.mock.restoreAll()
  }
})

test("checkout is an explicit one-id wallet purchase and never trusts provider response for the confirmed cost", async (t) => {
  const module = await loadModule()
  const tokenCalls: Array<TokenOptions | undefined> = []
  const client = module.createMelhorEnvioShipmentClient(dependencies(tokenCalls))

  t.mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      assert.equal(
        String(input),
        "https://sandbox.melhorenvio.com.br/api/v2/me/shipment/checkout",
      )
      assert.equal(init?.method, "POST")
      assertCommonHeaders(init)
      assert.deepEqual(JSON.parse(String(init?.body)), { orders: [SHIPMENT_ID] })
      return Response.json({ purchase: "accepted", total: "99999.99" }, { status: 200 })
    },
  )

  assert.deepEqual(
    await client.purchaseMelhorEnvioShipment({
      providerShipmentId: SHIPMENT_ID,
      currentCostCents: 1842,
    }),
    { providerOrderId: SHIPMENT_ID, purchasedCostCents: 1842 },
  )
  assert.deepEqual(tokenCalls, [{ requiredScopes: ["shipping-checkout"] }])
})

test("checkout definite 4xx rejection is safe to retry only after user correction, while 5xx and network are outcome_unknown", async (t) => {
  const module = await loadModule()
  const cases = [
    { kind: "422", expected: "definite_rejection", status: 422 },
    { kind: "500", expected: "outcome_unknown", status: 500 },
    { kind: "network", expected: "outcome_unknown", status: null },
  ] as const

  for (const item of cases) {
    const tokenCalls: Array<TokenOptions | undefined> = []
    const client = module.createMelhorEnvioShipmentClient(dependencies(tokenCalls))
    let providerCalls = 0
    t.mock.method(globalThis, "fetch", async () => {
      providerCalls += 1
      if (item.kind === "network") throw new Error("checkout connection lost")
      return Response.json(
        { message: item.kind === "422" ? "insufficient balance" : "provider error" },
        { status: item.status ?? 500 },
      )
    })

    await assert.rejects(
      () =>
        client.purchaseMelhorEnvioShipment({
          providerShipmentId: SHIPMENT_ID,
          currentCostCents: 1842,
        }),
      (error: unknown) =>
        assertProviderError(
          error,
          module.MelhorEnvioShipmentProviderError,
          item.expected,
          item.status,
        ),
    )
    assert.equal(providerCalls, 1)
    assert.deepEqual(tokenCalls, [{ requiredScopes: ["shipping-checkout"] }])
    t.mock.restoreAll()
  }
})

test("generation uses shipping-generate and accepts only a bounded JSON success object", async (t) => {
  const module = await loadModule()
  const tokenCalls: Array<TokenOptions | undefined> = []
  const client = module.createMelhorEnvioShipmentClient(dependencies(tokenCalls))

  t.mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      assert.equal(
        String(input),
        "https://sandbox.melhorenvio.com.br/api/v2/me/shipment/generate",
      )
      assert.equal(init?.method, "POST")
      assertCommonHeaders(init)
      assert.deepEqual(JSON.parse(String(init?.body)), { orders: [SHIPMENT_ID] })
      return Response.json({ message: "accepted" }, { status: 200 })
    },
  )

  assert.deepEqual(
    await client.generateMelhorEnvioShipment({ providerShipmentId: SHIPMENT_ID }),
    { accepted: true },
  )
  assert.deepEqual(tokenCalls, [{ requiredScopes: ["shipping-generate"] }])
})

test("read supports exact cart-read and orders-read endpoints with strict bounded shipment state", async (t) => {
  const module = await loadModule()
  const tokenCalls: Array<TokenOptions | undefined> = []
  const client = module.createMelhorEnvioShipmentClient(dependencies(tokenCalls))
  let providerCalls = 0

  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    providerCalls += 1
    assert.equal(init?.method, "GET")
    assertCommonHeaders(init)
    if (providerCalls === 1) {
      assert.equal(
        String(input),
        `https://sandbox.melhorenvio.com.br/api/v2/me/cart/${SHIPMENT_ID}`,
      )
      return Response.json({ id: SHIPMENT_ID, price: "18.42", status: "pending" })
    }
    assert.equal(
      String(input),
      `https://sandbox.melhorenvio.com.br/api/v2/me/orders/${SHIPMENT_ID}`,
    )
    return Response.json({
      id: SHIPMENT_ID,
      price: "18.42",
      status: "posted",
      tracking: "AB123456789BR",
      tracking_url: "https://melhorrastreio.com.br/rastreio/AB123456789BR",
    })
  })

  assert.deepEqual(
    await client.readMelhorEnvioShipment({ providerShipmentId: SHIPMENT_ID, source: "cart" }),
    {
      providerShipmentId: SHIPMENT_ID,
      status: "pending",
      priceCents: 1842,
      trackingCode: null,
      trackingUrl: null,
    },
  )
  assert.deepEqual(
    await client.readMelhorEnvioShipment({ providerShipmentId: SHIPMENT_ID, source: "order" }),
    {
      providerShipmentId: SHIPMENT_ID,
      status: "posted",
      priceCents: 1842,
      trackingCode: "AB123456789BR",
      trackingUrl: "https://melhorrastreio.com.br/rastreio/AB123456789BR",
    },
  )
  assert.deepEqual(tokenCalls, [
    { requiredScopes: ["cart-read"] },
    { requiredScopes: ["orders-read"] },
  ])
})

test("private label print returns only a validated HTTPS resource URL", async (t) => {
  const module = await loadModule()
  const tokenCalls: Array<TokenOptions | undefined> = []
  const client = module.createMelhorEnvioShipmentClient(dependencies(tokenCalls))

  t.mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      assert.equal(
        String(input),
        "https://sandbox.melhorenvio.com.br/api/v2/me/shipment/print",
      )
      assert.equal(init?.method, "POST")
      assertCommonHeaders(init)
      assert.deepEqual(JSON.parse(String(init?.body)), {
        mode: "private",
        orders: [SHIPMENT_ID],
      })
      return Response.json({ url: "https://sandbox.melhorenvio.com.br/print/label" })
    },
  )

  assert.deepEqual(
    await client.getMelhorEnvioPrintResource({ providerShipmentId: SHIPMENT_ID }),
    { url: "https://sandbox.melhorenvio.com.br/print/label" },
  )
  assert.deepEqual(tokenCalls, [{ requiredScopes: ["shipping-print"] }])
})

test("DACE uses the documented one-order GET resource and rejects unsafe URLs", async (t) => {
  const module = await loadModule()
  const tokenCalls: Array<TokenOptions | undefined> = []
  const client = module.createMelhorEnvioShipmentClient(dependencies(tokenCalls))
  let responseUrl = "https://sandbox.melhorenvio.com.br/print/dace"

  t.mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      assert.equal(
        String(input),
        `https://sandbox.melhorenvio.com.br/api/v2/me/imprimir/dace/pdf/${SHIPMENT_ID}`,
      )
      assert.equal(init?.method, "GET")
      assertCommonHeaders(init)
      return Response.json({ url: responseUrl })
    },
  )

  assert.deepEqual(
    await client.getMelhorEnvioDaceResource({ providerShipmentId: SHIPMENT_ID, format: "pdf" }),
    { url: responseUrl },
  )

  responseUrl = "javascript:alert(1)"
  await assert.rejects(
    () => client.getMelhorEnvioDaceResource({ providerShipmentId: SHIPMENT_ID, format: "pdf" }),
    (error: unknown) =>
      assertProviderError(error, module.MelhorEnvioShipmentProviderError, "invalid_response", 200),
  )
  assert.deepEqual(tokenCalls, [
    { requiredScopes: ["shipping-print"] },
    { requiredScopes: ["shipping-print"] },
  ])
})

test("tracking posts a bounded batch and maps only requested shipment ids", async (t) => {
  const module = await loadModule()
  const tokenCalls: Array<TokenOptions | undefined> = []
  const client = module.createMelhorEnvioShipmentClient(dependencies(tokenCalls))

  t.mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      assert.equal(
        String(input),
        "https://sandbox.melhorenvio.com.br/api/v2/me/shipment/tracking",
      )
      assert.equal(init?.method, "POST")
      assertCommonHeaders(init)
      assert.deepEqual(JSON.parse(String(init?.body)), { orders: [SHIPMENT_ID, SHIPMENT_ID_2] })
      return Response.json({
        [SHIPMENT_ID]: {
          id: SHIPMENT_ID,
          status: "posted",
          tracking: "AB123456789BR",
          tracking_url: "https://melhorrastreio.com.br/rastreio/AB123456789BR",
        },
        [SHIPMENT_ID_2]: {
          id: SHIPMENT_ID_2,
          status: "delivered",
          tracking: null,
          tracking_url: null,
        },
      })
    },
  )

  assert.deepEqual(
    await client.trackMelhorEnvioShipments({ providerShipmentIds: [SHIPMENT_ID, SHIPMENT_ID_2] }),
    [
      {
        providerShipmentId: SHIPMENT_ID,
        status: "posted",
        trackingCode: "AB123456789BR",
        trackingUrl: "https://melhorrastreio.com.br/rastreio/AB123456789BR",
      },
      {
        providerShipmentId: SHIPMENT_ID_2,
        status: "delivered",
        trackingCode: null,
        trackingUrl: null,
      },
    ],
  )
  assert.deepEqual(tokenCalls, [{ requiredScopes: ["shipping-tracking"] }])
})

test("cancellation always sends reason 2 with the bounded explicit description", async (t) => {
  const module = await loadModule()
  const tokenCalls: Array<TokenOptions | undefined> = []
  const client = module.createMelhorEnvioShipmentClient(dependencies(tokenCalls))

  t.mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      assert.equal(
        String(input),
        "https://sandbox.melhorenvio.com.br/api/v2/me/shipment/cancel",
      )
      assert.equal(init?.method, "POST")
      assertCommonHeaders(init)
      assert.deepEqual(JSON.parse(String(init?.body)), {
        order: {
          id: SHIPMENT_ID,
          reason_id: 2,
          description: "Pedido cancelado pelo lojista",
        },
      })
      return Response.json({ status: "canceled" })
    },
  )

  assert.deepEqual(
    await client.cancelMelhorEnvioShipment({
      providerShipmentId: SHIPMENT_ID,
      description: "Pedido cancelado pelo lojista",
    }),
    { providerShipmentId: SHIPMENT_ID, canceled: true },
  )
  assert.deepEqual(tokenCalls, [{ requiredScopes: ["shipping-cancel"] }])
})

test("provider failures expose no raw response, bearer token or sender CPF through errors or logs", async (t) => {
  const module = await loadModule()
  const client = module.createMelhorEnvioShipmentClient({
    getConfig: () => config(),
    getAccessToken: async () => token("super-secret-bearer", 11),
  })
  const logs: unknown[][] = []
  t.mock.method(console, "error", (...args: unknown[]) => {
    logs.push(args)
  })
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      {
        message:
          "provider leaked super-secret-bearer and CPF 52998224725 in diagnostic response",
      },
      { status: 422 },
    ),
  )

  await assert.rejects(
    () =>
      client.addShipmentToMelhorEnvioCart({
        sender,
        snapshot,
        documentMode: "declaration_content",
      }),
    (error: unknown) => {
      assertProviderError(
        error,
        module.MelhorEnvioShipmentProviderError,
        "definite_rejection",
        422,
      )
      assert.ok(error instanceof Error)
      assert.doesNotMatch(error.message, /super-secret-bearer|52998224725|provider leaked/)
      return true
    },
  )
  const serializedLogs = JSON.stringify(logs)
  assert.doesNotMatch(serializedLogs, /super-secret-bearer|52998224725|provider leaked/)
})