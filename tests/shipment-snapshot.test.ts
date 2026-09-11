import assert from "node:assert/strict"
import test from "node:test"

type SnapshotError = Error & { code?: string }
type SnapshotModule = {
  buildShipmentPreparationSnapshot(input: {
    order: Record<string, unknown>
    sender: Record<string, unknown>
    expectedOriginCep: string
  }): unknown
}

async function loadSnapshot(): Promise<SnapshotModule> {
  const moduleUrl = new URL("../lib/server/shipment-snapshot.ts", import.meta.url).href
  return (await import(moduleUrl)) as SnapshotModule
}

const ORDER_ID = "11111111-1111-4111-8111-111111111111"

function sender(overrides: Record<string, unknown> = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    environment: "production",
    fullName: "Breno Bembem",
    cpf: "12345678909",
    email: "contato@proxybembem.com.br",
    phone: "44999999999",
    postalCode: "86730000",
    street: "Rua do Remetente",
    number: "10",
    complement: null,
    neighborhood: "Centro",
    city: "Astorga",
    state: "PR",
    version: 3,
    updatedAt: "2026-09-09T09:00:00.000Z",
    ...overrides,
  }
}

function savedPackage(overrides: Record<string, unknown> = {}) {
  return {
    price: "18.42",
    discount: "0.00",
    format: "box",
    dimensions: { height: 5, width: 15, length: 20 },
    weight: "0.50",
    insurance_value: "119.90",
    products: [{ id: "1", quantity: 1 }],
    ...overrides,
  }
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    order_number: "PB-A1B2C3D4E5F6",
    customer_name: "Cliente Teste",
    customer_email: "cliente@example.com",
    customer_cpf: "52998224725",
    whatsapp: "5511999999999",
    cep: "01310100",
    address_street: "Avenida Paulista",
    address_number: "1000",
    address_complement: "Apto 1",
    address_neighborhood: "Bela Vista",
    address_city: "São Paulo",
    address_state: "SP",
    items: [
      {
        productId: 1,
        title: "Deck Commander Proxy 100 Cartas",
        unitPriceCents: 11990,
        quantity: 1,
        shipping: {
          // Intentionally different from the saved provider package: the shipment
          // must reuse the immutable quote package rather than current/catalog dimensions.
          weightKg: 0.25,
          lengthCm: 18,
          widthCm: 13,
          heightCm: 4,
        },
      },
    ],
    subtotal_cents: 11990,
    shipping_provider: "melhor_envio",
    shipping_service_id: "2",
    shipping_service_name: "SEDEX",
    shipping_carrier_name: "Correios",
    shipping_delivery_days: 3,
    shipping_cents: 1842,
    shipping_snapshot: {
      destinationCep: "01310100",
      service: {
        id: "2",
        name: "SEDEX",
        carrier: "Correios",
        priceCents: 1842,
        deliveryDays: 3,
      },
      packages: [savedPackage()],
      products: [
        {
          productId: 1,
          quantity: 1,
          widthCm: 13,
          heightCm: 4,
          lengthCm: 18,
          weightKg: 0.25,
          insuranceValue: 119.9,
        },
      ],
    },
    total_cents: 13832,
    payment_provider: "mercadopago",
    preference_id: "pref-123",
    payment_id: "175133542535",
    payment_status: "approved",
    payment_status_detail: "accredited",
    fulfillment_status: "ready_to_ship",
    created_at: "2026-09-02T12:00:00.000Z",
    updated_at: "2026-09-09T09:00:00.000Z",
    ...overrides,
  }
}

async function expectCode(
  input: Parameters<SnapshotModule["buildShipmentPreparationSnapshot"]>[0],
  code: string,
) {
  const { buildShipmentPreparationSnapshot } = await loadSnapshot()
  assert.throws(
    () => buildShipmentPreparationSnapshot(input),
    (error: unknown) =>
      error instanceof Error &&
      (error as SnapshotError).code === code &&
      !error.message.includes("cliente@example.com") &&
      !error.message.includes("12345678909"),
  )
}

test("builds one trusted preparation snapshot from immutable order and saved quote data", async () => {
  const { buildShipmentPreparationSnapshot } = await loadSnapshot()
  const result = buildShipmentPreparationSnapshot({
    order: order(),
    sender: sender(),
    expectedOriginCep: "86730000",
  })

  assert.deepEqual(result, {
    service: { id: "2", name: "SEDEX", carrier: "Correios" },
    customerShippingCents: 1842,
    recipient: {
      name: "Cliente Teste",
      email: "cliente@example.com",
      phone: "5511999999999",
      document: "52998224725",
      postalCode: "01310100",
      street: "Avenida Paulista",
      number: "1000",
      complement: "Apto 1",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    },
    package: {
      height: 5,
      width: 15,
      length: 20,
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
  })
})

test("never resolves current catalog dimensions or price while building a shipment", async () => {
  const { buildShipmentPreparationSnapshot } = await loadSnapshot()
  const changedHistoricItem = order({
    items: [
      {
        productId: 1,
        title: "Título salvo no pedido",
        unitPriceCents: 9999,
        quantity: 1,
        shipping: { weightKg: 9, lengthCm: 99, widthCm: 99, heightCm: 99 },
      },
    ],
    subtotal_cents: 9999,
    total_cents: 11841,
    shipping_snapshot: {
      destinationCep: "01310100",
      service: {
        id: "2",
        name: "SEDEX",
        carrier: "Correios",
        priceCents: 1842,
        deliveryDays: 3,
      },
      packages: [
        savedPackage({
          insurance_value: "99.99",
          products: [{ id: "1", quantity: 1 }],
        }),
      ],
      products: [
        {
          productId: 1,
          quantity: 1,
          widthCm: 99,
          heightCm: 99,
          lengthCm: 99,
          weightKg: 9,
          insuranceValue: 99.99,
        },
      ],
    },
  })

  const result = buildShipmentPreparationSnapshot({
    order: changedHistoricItem,
    sender: sender(),
    expectedOriginCep: "86730000",
  }) as { declarationItems: Array<{ description: string; unitValueCents: number }>; package: unknown }

  assert.deepEqual(result.declarationItems, [
    { productId: 1, description: "Título salvo no pedido", quantity: 1, unitValueCents: 9999 },
  ])
  assert.deepEqual(result.package, {
    height: 5,
    width: 15,
    length: 20,
    weight: 0.5,
    insuranceValueCents: 9999,
  })
})

test("rejects zero multiple and malformed saved provider packages", async () => {
  const base = order()
  const snapshot = base.shipping_snapshot as Record<string, unknown>

  await expectCode(
    {
      order: order({ shipping_snapshot: { ...snapshot, packages: [] } }),
      sender: sender(),
      expectedOriginCep: "86730000",
    },
    "shipping_package_snapshot_invalid",
  )
  await expectCode(
    {
      order: order({
        shipping_snapshot: { ...snapshot, packages: [savedPackage(), savedPackage()] },
      }),
      sender: sender(),
      expectedOriginCep: "86730000",
    },
    "multiple_packages_not_supported",
  )
  await expectCode(
    {
      order: order({
        shipping_snapshot: {
          ...snapshot,
          packages: [savedPackage({ weight: "0", dimensions: { height: 0, width: 15, length: 20 } })],
        },
      }),
      sender: sender(),
      expectedOriginCep: "86730000",
    },
    "shipping_package_snapshot_invalid",
  )
})

test("rejects service destination declaration and insurance inconsistencies", async () => {
  const base = order()
  const snapshot = base.shipping_snapshot as Record<string, unknown>

  for (const shipping_snapshot of [
    {
      ...snapshot,
      service: { id: "1", name: "PAC", carrier: "Correios", priceCents: 1842, deliveryDays: 3 },
    },
    { ...snapshot, destinationCep: "99999999" },
    {
      ...snapshot,
      packages: [savedPackage({ insurance_value: "120.00" })],
    },
    {
      ...snapshot,
      products: [{
        productId: 1,
        quantity: 2,
        widthCm: 13,
        heightCm: 4,
        lengthCm: 18,
        weightKg: 0.25,
        insuranceValue: 119.9,
      }],
    },
  ]) {
    await expectCode(
      { order: order({ shipping_snapshot }), sender: sender(), expectedOriginCep: "86730000" },
      "shipping_snapshot_invalid",
    )
  }
})

test("rejects sender origin mismatch and orders that are unpaid or not ready to ship", async () => {
  await expectCode(
    { order: order(), sender: sender({ postalCode: "01001000" }), expectedOriginCep: "86730000" },
    "sender_origin_mismatch",
  )
  await expectCode(
    { order: order({ payment_status: "pending" }), sender: sender(), expectedOriginCep: "86730000" },
    "order_not_ready",
  )
  await expectCode(
    { order: order({ fulfillment_status: "in_production" }), sender: sender(), expectedOriginCep: "86730000" },
    "order_not_ready",
  )
  await expectCode(
    { order: order({ shipping_provider: "other" }), sender: sender(), expectedOriginCep: "86730000" },
    "unsupported_shipping_provider",
  )
})

test("rejects incomplete recipients and invalid immutable declaration values", async () => {
  for (const overrides of [
    { cep: "123" },
    { address_street: null },
    { address_number: "" },
    { address_neighborhood: null },
    { address_city: null },
    { address_state: "Paraná" },
    { customer_email: null },
  ]) {
    await expectCode(
      { order: order(overrides), sender: sender(), expectedOriginCep: "86730000" },
      "recipient_invalid",
    )
  }

  await expectCode(
    {
      order: order({
        items: [{
          productId: 1,
          title: "Deck",
          unitPriceCents: 11990,
          quantity: 0,
          shipping: { weightKg: 0.25, lengthCm: 18, widthCm: 13, heightCm: 4 },
        }],
      }),
      sender: sender(),
      expectedOriginCep: "86730000",
    },
    "declaration_invalid",
  )
})