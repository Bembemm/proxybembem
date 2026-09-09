import assert from "node:assert/strict"
import test from "node:test"

type Environment = "sandbox" | "production"
type Dependencies = {
  getConfig(): { environment: Environment; userAgent: string }
  getAccessToken(options?: { requiredScopes?: readonly string[] }): Promise<{
    accessToken: string
    tokenVersion: number
    authorizedScopes: string[]
  }>
}

type Client = {
  addShipmentToMelhorEnvioCart(input: {
    sender: {
      personType: "pj"
      fullName: string
      cpf: null
      cnpj: string
      stateRegister: string
      economicActivityCode: string | null
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
    snapshot: {
      service: { id: string; name: string; carrier: string }
      recipient: {
        name: string
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
    documentMode: "invoice"
    invoiceKey: string
  }): Promise<{ providerShipmentId: string; currentCostCents: number }>
}

type Module = {
  createMelhorEnvioShipmentClient(deps: Dependencies): Client
}

const SHIPMENT_ID = "6e1c864a-fe48-4ae7-baaa-d6e4888bafd1"
const NF_E_KEY = "42240446867029000176550010000012341000012345"
const CNPJ = "46867029000176"

const snapshot = {
  service: { id: "1", name: "PAC", carrier: "Correios" },
  recipient: {
    name: "Cliente Teste",
    email: "cliente@example.com",
    phone: "11999999999",
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
      description: "Produto",
      quantity: 1,
      unitValueCents: 11990,
    },
  ],
  declarationValueCents: 11990,
}

const sender = {
  personType: "pj" as const,
  fullName: "Proxy Bembem",
  cpf: null,
  cnpj: CNPJ,
  stateRegister: "123456789",
  economicActivityCode: null,
  email: "contato@proxybembem.com.br",
  phone: "44999999999",
  postalCode: "86730000",
  street: "Rua do Remetente",
  number: "10",
  complement: null,
  neighborhood: "Centro",
  city: "Astorga",
  state: "PR",
}

function deps(): Dependencies {
  return {
    getConfig: () => ({
      environment: "sandbox",
      userAgent: "ProxyBembem (contato@proxybembem.com.br)",
    }),
    getAccessToken: async () => ({
      accessToken: "token",
      tokenVersion: 1,
      authorizedScopes: ["cart-write"],
    }),
  }
}

test("commercial cart insertion uses PJ/CNPJ plus NF-e key and never sends CPF/DC-e fields", async (t) => {
  const module = (await import("../lib/server/melhor-envio-shipment-client.ts")) as unknown as Module
  const client = module.createMelhorEnvioShipmentClient(deps())

  t.mock.method(
    globalThis,
    "fetch",
    async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const body = JSON.parse(String(init?.body)) as {
        from: Record<string, unknown>
        options: Record<string, unknown>
      }
      assert.equal(body.from.company_document, CNPJ)
      assert.equal(body.from.state_register, "123456789")
      assert.equal("document" in body.from, false)
      assert.deepEqual(body.options.invoice, { key: NF_E_KEY })
      assert.equal("dce" in body.options, false)
      return Response.json({ id: SHIPMENT_ID, price: "18.42" }, { status: 201 })
    },
  )

  assert.deepEqual(
    await client.addShipmentToMelhorEnvioCart({
      sender,
      snapshot,
      documentMode: "invoice",
      invoiceKey: NF_E_KEY,
    }),
    { providerShipmentId: SHIPMENT_ID, currentCostCents: 1842 },
  )
})

test("invoice mode fails closed without a valid NF-e key or PJ sender", async (t) => {
  const module = (await import("../lib/server/melhor-envio-shipment-client.ts")) as unknown as Module
  const client = module.createMelhorEnvioShipmentClient(deps())
  let calls = 0
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1
    return Response.json({ id: SHIPMENT_ID, price: "18.42" }, { status: 201 })
  })

  await assert.rejects(() =>
    client.addShipmentToMelhorEnvioCart({
      sender,
      snapshot,
      documentMode: "invoice",
      invoiceKey: "123",
    }),
  )
  await assert.rejects(() =>
    client.addShipmentToMelhorEnvioCart({
      sender: { ...sender, cnpj: "11111111111111" },
      snapshot,
      documentMode: "invoice",
      invoiceKey: NF_E_KEY,
    }),
  )
  assert.equal(calls, 0)
})
