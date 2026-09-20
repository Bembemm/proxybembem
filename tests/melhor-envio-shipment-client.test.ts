import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

type Environment = "sandbox" | "production"
type TokenOptions = {
  forceRefresh?: boolean
  rejectedTokenVersion?: number
  requiredScopes?: readonly string[]
}

const USER_AGENT = "ProxyBembem (contato@proxybembem.com.br)"
const SHIPMENT_ID = "6e1c864a-fe48-4ae7-baaa-d6e4888bafd1"

const sender = {
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

const snapshot = {
  service: { id: "1", name: "PAC", carrier: "Correios" },
  recipient: {
    name: "Cliente Teste",
    email: "cliente@example.com",
    phone: "11999999999",
    document: "11144477735",
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

function dependencies(
  tokenCalls: Array<TokenOptions | undefined>,
  environment: Environment = "sandbox",
) {
  return {
    getConfig: () => ({ environment, userAgent: USER_AGENT }),
    getAccessToken: async (options?: TokenOptions) => {
      tokenCalls.push(options)
      return {
        accessToken: "token-v7",
        tokenVersion: 7,
        authorizedScopes: ["shipping-calculate", "cart-write"],
      }
    },
  }
}

test("shipment client only adds a validated shipment to the Melhor Envio cart", async (t) => {
  const { createMelhorEnvioShipmentClient } = await import(
    "../lib/server/melhor-envio-shipment-client.ts"
  )
  const tokenCalls: Array<TokenOptions | undefined> = []
  const client = createMelhorEnvioShipmentClient(dependencies(tokenCalls))

  t.mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      assert.equal(
        String(input),
        "https://sandbox.melhorenvio.com.br/api/v2/me/cart",
      )
      assert.equal(init?.method, "POST")
      assert.equal(init?.cache, "no-store")

      const headers = new Headers(init?.headers)
      assert.equal(headers.get("authorization"), "Bearer token-v7")
      assert.equal(headers.get("user-agent"), USER_AGENT)

      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>
      assert.equal(payload.service, 1)
      assert.equal(Array.isArray(payload.volumes), true)
      assert.equal(Array.isArray(payload.products), true)

      return Response.json(
        { id: SHIPMENT_ID, price: "18.42" },
        { status: 200 },
      )
    },
  )

  const result = await client.addShipmentToMelhorEnvioCart({
    sender,
    snapshot,
    documentMode: "declaration_content",
  })

  assert.deepEqual(result, {
    providerShipmentId: SHIPMENT_ID,
    currentCostCents: 1842,
  })
  assert.deepEqual(tokenCalls, [{ requiredScopes: ["cart-write"] }])
})

test("shipment client retries authentication once without widening OAuth scopes", async (t) => {
  const { createMelhorEnvioShipmentClient } = await import(
    "../lib/server/melhor-envio-shipment-client.ts"
  )
  const tokenCalls: Array<TokenOptions | undefined> = []
  let providerCalls = 0
  const client = createMelhorEnvioShipmentClient({
    ...dependencies(tokenCalls),
    getAccessToken: async (options?: TokenOptions) => {
      tokenCalls.push(options)
      return {
        accessToken: options?.forceRefresh ? "token-v8" : "token-v7",
        tokenVersion: options?.forceRefresh ? 8 : 7,
        authorizedScopes: ["shipping-calculate", "cart-write"],
      }
    },
  })

  t.mock.method(globalThis, "fetch", async () => {
    providerCalls += 1
    if (providerCalls === 1) {
      return Response.json({ message: "Unauthenticated." }, { status: 401 })
    }
    return Response.json({ id: SHIPMENT_ID, price: 18.42 }, { status: 200 })
  })

  await client.addShipmentToMelhorEnvioCart({
    sender,
    snapshot,
    documentMode: "declaration_content",
  })

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

test("shipment client source exposes no purchase, generation, print, cancel, tracking, or order-read operation", async () => {
  const source = await readFile(
    new URL("../lib/server/melhor-envio-shipment-client.ts", import.meta.url),
    "utf8",
  )

  for (const forbidden of [
    "/api/v2/me/shipment/checkout",
    "/api/v2/me/shipment/generate",
    "/api/v2/me/shipment/print",
    "/api/v2/me/imprimir/dace",
    "/api/v2/me/shipment/tracking",
    "/api/v2/me/shipment/cancel",
    "/api/v2/me/orders/",
    "shipping-checkout",
    "shipping-generate",
    "shipping-print",
    "shipping-tracking",
    "shipping-cancel",
    "orders-read",
    "cart-read",
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&")))
  }

  assert.match(source, /\/api\/v2\/me\/cart/)
  assert.match(source, /requiredScopes:\s*\["cart-write"\]/)
})
