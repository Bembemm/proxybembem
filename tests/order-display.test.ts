import assert from "node:assert/strict"
import test from "node:test"
import type { OrderRecord } from "../lib/server/orders.ts"
import { toOrderDisplayData } from "../lib/order-display.ts"

function baseOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order-id",
    order_number: "PB-A1B2C3D4E5F6",
    public_token: "a".repeat(64),
    customer_name: "Cliente",
    whatsapp: "44999999999",
    cep: "01001000",
    address_street: "Praça da Sé",
    address_number: "100",
    address_complement: "Apto 1",
    address_neighborhood: "Sé",
    address_city: "São Paulo",
    address_state: "SP",
    items: [
      {
        productId: 1,
        title: "Deck Commander Proxy 100 Cartas",
        unitPriceCents: 11990,
        quantity: 1,
        shipping: {
          weightKg: 0.25,
          lengthCm: 25,
          widthCm: 19,
          heightCm: 4,
        },
      },
    ],
    subtotal_cents: 11990,
    shipping_provider: "melhor_envio",
    shipping_service_id: "1",
    shipping_service_name: "PAC",
    shipping_carrier_name: "Correios",
    shipping_delivery_days: 6,
    shipping_cents: 1842,
    total_cents: 13832,
    shipping_snapshot: { internal: "must-not-be-exposed" },
    checkout_attempt_id: "550e8400-e29b-41d4-a716-446655440000",
    checkout_fingerprint: "fingerprint",
    checkout_url: "https://www.mercadopago.com/checkout",
    payment_provider: "mercadopago",
    preference_id: "pref-1",
    payment_id: "175133542535",
    payment_status: "approved",
    payment_status_detail: "accredited",
    fulfillment_status: "awaiting_production",
    created_at: "2026-08-29T00:00:00Z",
    updated_at: "2026-08-29T00:00:00Z",
    ...overrides,
  }
}

test("maps a current paid order from trusted integer-cent and delivery fields", () => {
  assert.deepEqual(toOrderDisplayData(baseOrder()), {
    orderNumber: "PB-A1B2C3D4E5F6",
    paymentStatus: "approved",
    items: [
      {
        title: "Deck Commander Proxy 100 Cartas",
        quantity: 1,
        unitPriceCents: 11990,
      },
    ],
    subtotalCents: 11990,
    shippingCents: 1842,
    totalCents: 13832,
    carrierName: "Correios",
    serviceName: "PAC",
    deliveryDays: 6,
    address: {
      street: "Praça da Sé",
      number: "100",
      complement: "Apto 1",
      neighborhood: "Sé",
      city: "São Paulo",
      state: "SP",
      cep: "01001000",
    },
  })
})

test("keeps legacy orders readable without inventing freight or address", () => {
  const result = toOrderDisplayData(
    baseOrder({
      address_street: null,
      address_number: null,
      address_complement: null,
      address_neighborhood: null,
      address_city: null,
      address_state: null,
      shipping_service_name: null,
      shipping_carrier_name: null,
      shipping_delivery_days: null,
      shipping_cents: null,
      total_cents: null,
    }),
  )

  assert.equal(result.totalCents, 11990)
  assert.equal(result.shippingCents, null)
  assert.equal(result.address, null)
  assert.equal(result.carrierName, null)
  assert.equal(result.serviceName, null)
})

test("does not expose internal provider, token, fingerprint, URL or snapshot fields", () => {
  const result = toOrderDisplayData(baseOrder()) as unknown as Record<string, unknown>
  for (const key of [
    "publicToken",
    "public_token",
    "checkoutUrl",
    "checkout_url",
    "checkoutFingerprint",
    "checkout_fingerprint",
    "shippingSnapshot",
    "shipping_snapshot",
    "paymentId",
    "payment_id",
    "preferenceId",
    "preference_id",
  ]) {
    assert.equal(key in result, false, key)
  }
})
