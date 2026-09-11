import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  normalizeCheckoutData,
  validateCheckout,
  type CheckoutData,
} from "../lib/checkout.ts"
import { createCheckoutFingerprint } from "../lib/server/checkout-idempotency.ts"
import { createOrder } from "../lib/server/orders.ts"

const VALID_CPF = "52998224725"
const OTHER_VALID_CPF = "11144477735"

function checkoutCustomer(cpf: string) {
  return {
    nome: "Cliente Teste",
    email: "cliente@example.com",
    whatsapp: "11999999999",
    cpf,
    cep: "01001000",
    rua: "Praça da Sé",
    numero: "100",
    complemento: "",
    bairro: "Sé",
    cidade: "São Paulo",
    uf: "SP",
  } as unknown as CheckoutData
}

function shipmentOrder(customerCpf: unknown = OTHER_VALID_CPF) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    order_number: "PB-CPFTESTE",
    customer_name: "Cliente Teste",
    customer_email: "cliente@example.com",
    customer_cpf: customerCpf,
    whatsapp: "11999999999",
    cep: "01001000",
    address_street: "Praça da Sé",
    address_number: "100",
    address_complement: null,
    address_neighborhood: "Sé",
    address_city: "São Paulo",
    address_state: "SP",
    items: [
      {
        productId: 1,
        title: "Deck Commander Proxy 100 Cartas",
        unitPriceCents: 11990,
        quantity: 1,
        shipping: { weightKg: 0.5, lengthCm: 25, widthCm: 19, heightCm: 4 },
      },
    ],
    subtotal_cents: 11990,
    shipping_provider: "melhor_envio",
    shipping_service_id: "1",
    shipping_service_name: "PAC",
    shipping_carrier_name: "Correios",
    shipping_delivery_days: 6,
    shipping_cents: 1842,
    shipping_snapshot: {
      destinationCep: "01001000",
      service: {
        id: "1",
        name: "PAC",
        carrier: "Correios",
        priceCents: 1842,
        deliveryDays: 6,
      },
      packages: [
        {
          dimensions: { height: 4, width: 19, length: 25 },
          weight: "0.5",
          insurance_value: "119.90",
          products: [{ id: "1", quantity: 1 }],
        },
      ],
      products: [
        {
          productId: 1,
          quantity: 1,
          widthCm: 19,
          heightCm: 4,
          lengthCm: 25,
          weightKg: 0.5,
          insuranceValue: 119.9,
        },
      ],
    },
    total_cents: 13832,
    payment_provider: "mercadopago",
    preference_id: "pref-test",
    payment_id: "pay-test",
    payment_status: "approved",
    payment_status_detail: "accredited",
    fulfillment_status: "ready_to_ship",
    created_at: "2026-09-10T12:00:00.000Z",
    updated_at: "2026-09-10T12:00:00.000Z",
  }
}

const sender = {
  id: "22222222-2222-4222-8222-222222222222",
  environment: "production",
  fullName: "Breno Bembem",
  cpf: VALID_CPF,
  email: "contato@proxybembem.com.br",
  phone: "44999999999",
  postalCode: "86730000",
  street: "Rua do Remetente",
  number: "10",
  complement: null,
  neighborhood: "Centro",
  city: "Astorga",
  state: "PR",
  version: 2,
  updatedAt: "2026-09-10T12:00:00.000Z",
}

test("checkout normalizes a formatted CPF and validates its checksum", () => {
  const normalized = normalizeCheckoutData(
    checkoutCustomer("529.982.247-25"),
  ) as unknown as Record<string, unknown>
  assert.equal(normalized.cpf, VALID_CPF)
  assert.deepEqual(validateCheckout(checkoutCustomer("529.982.247-25")), {})

  const invalid = validateCheckout(
    checkoutCustomer("111.111.111-11"),
  ) as unknown as Record<string, unknown>
  assert.equal(invalid.cpf, "Informe um CPF válido.")

  const missing = validateCheckout(checkoutCustomer("")) as unknown as Record<
    string,
    unknown
  >
  assert.equal(missing.cpf, "Informe um CPF válido.")
})

test("checkout idempotency fingerprint changes when the recipient CPF changes", () => {
  const cartFingerprint = "a".repeat(64)
  const quoteClaims = {
    serviceId: "1",
    priceCents: 1842,
    destinationCep: "01001000",
    cartFingerprint,
  }

  const first = createCheckoutFingerprint({
    cartFingerprint,
    customer: checkoutCustomer(VALID_CPF),
    quoteClaims: quoteClaims as never,
  })
  const second = createCheckoutFingerprint({
    cartFingerprint,
    customer: checkoutCustomer(OTHER_VALID_CPF),
    quoteClaims: quoteClaims as never,
  })

  assert.notEqual(first, second)
})

test("order persistence writes normalized customer_cpf", async (t) => {
  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SECRET_KEY
  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "service-role-test"
  t.after(() => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY
    else process.env.SUPABASE_SECRET_KEY = previousKey
  })

  const postedBodies: Array<Record<string, unknown>> = []
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      postedBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return Response.json([{ id: "11111111-1111-4111-8111-111111111111" }], {
        status: 201,
      })
    },
  )

  await createOrder({
    orderNumber: "PB-CPFTESTE",
    publicToken: "a".repeat(64),
    customerName: "Cliente Teste",
    customerEmail: "cliente@example.com",
    customerCpf: VALID_CPF,
    whatsapp: "11999999999",
    cep: "01001000",
    items: [],
    subtotalCents: 11990,
  } as unknown as Parameters<typeof createOrder>[0])

  assert.equal(postedBodies[0]?.customer_cpf, VALID_CPF)
})

test("shipment snapshot requires a checksum-valid recipient CPF and keeps it internal", async () => {
  const moduleUrl = new URL("../lib/server/shipment-snapshot.ts", import.meta.url).href
  const module = (await import(moduleUrl)) as {
    buildShipmentPreparationSnapshot(input: {
      order: Record<string, unknown>
      sender: Record<string, unknown>
      expectedOriginCep: string
    }): unknown
  }

  const snapshot = module.buildShipmentPreparationSnapshot({
    order: shipmentOrder(),
    sender,
    expectedOriginCep: "86730000",
  }) as { recipient: Record<string, unknown> }
  assert.equal(snapshot.recipient.document, OTHER_VALID_CPF)

  for (const cpf of [null, "", "11111111111"]) {
    assert.throws(
      () =>
        module.buildShipmentPreparationSnapshot({
          order: shipmentOrder(cpf),
          sender,
          expectedOriginCep: "86730000",
        }),
      (error: unknown) =>
        error instanceof Error &&
        (error as Error & { code?: string }).code === "recipient_invalid",
    )
  }
})

test("Melhor Envio cart payload sends the recipient CPF as to.document", async (t) => {
  const moduleUrl = new URL(
    "../lib/server/melhor-envio-shipment-client.ts",
    import.meta.url,
  ).href
  const module = (await import(moduleUrl)) as {
    createMelhorEnvioShipmentClient(deps: Record<string, unknown>): {
      addShipmentToMelhorEnvioCart(input: Record<string, unknown>): Promise<unknown>
    }
  }
  const client = module.createMelhorEnvioShipmentClient({
    getConfig: () => ({
      environment: "production",
      userAgent: "ProxyBembem (contato@proxybembem.com.br)",
    }),
    getAccessToken: async () => ({
      accessToken: "token-test",
      tokenVersion: 1,
      authorizedScopes: ["cart-write"],
    }),
  })

  const requestBodies: Array<Record<string, unknown>> = []
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return Response.json(
        { id: "6e1c864a-fe48-4ae7-baaa-d6e4888bafd1", price: "18.42" },
        { status: 201 },
      )
    },
  )

  await client.addShipmentToMelhorEnvioCart({
    sender: {
      fullName: "Breno Bembem",
      cpf: VALID_CPF,
      email: "contato@proxybembem.com.br",
      phone: "44999999999",
      postalCode: "86730000",
      street: "Rua do Remetente",
      number: "10",
      complement: null,
      neighborhood: "Centro",
      city: "Astorga",
      state: "PR",
    },
    snapshot: {
      service: { id: "1", name: "PAC", carrier: "Correios" },
      recipient: {
        name: "Cliente Teste",
        email: "cliente@example.com",
        phone: "11999999999",
        document: OTHER_VALID_CPF,
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
        weight: 0.5,
        insuranceValueCents: 11990,
      },
      declarationItems: [
        {
          productId: 1,
          description: "Deck Commander Proxy 100 Cartas",
          quantity: 1,
          unitValueCents: 11990,
        },
      ],
      declarationValueCents: 11990,
    },
    documentMode: "declaration_content",
  })

  const to = requestBodies[0]?.to as Record<string, unknown> | undefined
  assert.equal(to?.document, OTHER_VALID_CPF)
})

test("checkout UI and API require CPF while customer projection stays curated", async () => {
  const [formSource, routeSource, migrationSource] = await Promise.all([
    readFile(new URL("../components/checkout-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/checkout/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../supabase/migrations/20260910123000_orders_customer_cpf.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ])

  assert.match(formSource, /checkout-cpf/)
  assert.match(formSource, /onChange\("cpf"/)
  assert.match(routeSource, /"cpf"/)

  assert.match(migrationSource, /add column customer_cpf text/i)
  assert.match(migrationSource, /orders_customer_cpf_format/i)
  assert.match(migrationSource, /\^\[0-9\]\{11\}\$/i)
  assert.doesNotMatch(migrationSource, /customer_cpf\s+text\s+not null/i)
  assert.doesNotMatch(migrationSource, /customer_get_order/i)
  assert.doesNotMatch(migrationSource, /customer_list_orders/i)
})