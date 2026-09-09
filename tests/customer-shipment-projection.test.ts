import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  getOwnOrderByIdWithDependencies,
  type CustomerOrderDependencies,
} from "../lib/server/customer-orders.ts"

const ORDER_ID = "550e8400-e29b-41d4-a716-446655440000"
const CREATED_AT = "2026-09-02T12:00:00.000Z"
const POSTED_AT = "2026-09-09T12:00:00.000Z"
const TRANSIT_AT = "2026-09-09T13:00:00.000Z"
const UPDATED_AT = "2026-09-09T13:05:00.000Z"

function detail(shipment: unknown) {
  return {
    id: ORDER_ID,
    order_number: "PB-A1B2C3D4E5F6",
    items: [
      {
        productId: 1,
        title: "Deck Commander Proxy 100 Cartas",
        unitPriceCents: 11990,
        quantity: 1,
        shipping: { weightKg: 0.25, lengthCm: 20, widthCm: 15, heightCm: 2 },
      },
    ],
    subtotal_cents: 11990,
    shipping_cents: 1500,
    total_cents: 13490,
    payment_status: "approved",
    fulfillment_status: "shipped",
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
    shipping_service_name: "PAC",
    shipping_carrier_name: "Correios",
    shipping_delivery_days: 5,
    customer_name: "Cliente Teste",
    whatsapp: "44999999999",
    customer_email: "cliente@example.com",
    address_street: "Rua Teste",
    address_number: "123",
    address_complement: null,
    address_neighborhood: "Centro",
    address_city: "Maringá",
    address_state: "PR",
    timeline: [],
    shipment,
  }
}

function dependencies(detailResult: unknown): CustomerOrderDependencies {
  return {
    async listOrders() {
      throw new Error("unused")
    },
    async getOrder() {
      return detailResult
    },
  }
}

function safeShipment(overrides: Record<string, unknown> = {}) {
  return {
    carrier_name: "Correios",
    service_name: "PAC",
    tracking_code: "BR123456789BR",
    status: "in_transit",
    updated_at: UPDATED_AT,
    timeline: [
      { kind: "posted", created_at: POSTED_AT },
      { kind: "in_transit", created_at: TRANSIT_AT },
    ],
    ...overrides,
  }
}

test("customer detail parses only the sanitized shipment projection", async () => {
  const result = await getOwnOrderByIdWithDependencies(
    ORDER_ID,
    dependencies(detail(safeShipment())),
  )

  assert.deepEqual(result, {
    id: ORDER_ID,
    orderNumber: "PB-A1B2C3D4E5F6",
    items: [
      {
        productId: 1,
        title: "Deck Commander Proxy 100 Cartas",
        unitPriceCents: 11990,
        quantity: 1,
      },
    ],
    subtotalCents: 11990,
    shippingCents: 1500,
    totalCents: 13490,
    paymentStatus: "approved",
    fulfillmentStatus: "shipped",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    shippingServiceName: "PAC",
    shippingCarrierName: "Correios",
    shippingDeliveryDays: 5,
    customerName: "Cliente Teste",
    whatsapp: "44999999999",
    customerEmail: "cliente@example.com",
    address: {
      street: "Rua Teste",
      number: "123",
      complement: null,
      neighborhood: "Centro",
      city: "Maringá",
      state: "PR",
    },
    timeline: [],
    shipment: {
      carrierName: "Correios",
      serviceName: "PAC",
      trackingCode: "BR123456789BR",
      status: "in_transit",
      updatedAt: UPDATED_AT,
      timeline: [
        { kind: "posted", createdAt: POSTED_AT },
        { kind: "in_transit", createdAt: TRANSIT_AT },
      ],
    },
  })
})

test("customer shipment projection permits null but rejects extra internal or malformed fields", async () => {
  const withoutShipment = await getOwnOrderByIdWithDependencies(
    ORDER_ID,
    dependencies(detail(null)),
  )
  assert.equal((withoutShipment as unknown as { shipment: unknown }).shipment, null)

  for (const unsafe of [
    safeShipment({ provider_order_id: "provider-order" }),
    safeShipment({ provider_cart_id: "provider-cart" }),
    safeShipment({ provider_status: "raw-provider-state" }),
    safeShipment({ provider_cost_cents: 999 }),
    safeShipment({ sender_cpf: "12345678909" }),
    safeShipment({ print_url: "https://example.com/label" }),
    safeShipment({ status: "provider_future_status" }),
    safeShipment({ tracking_code: "x".repeat(129) }),
    safeShipment({ timeline: [{ kind: "raw_provider_event", created_at: POSTED_AT }] }),
  ]) {
    await assert.rejects(() =>
      getOwnOrderByIdWithDependencies(ORDER_ID, dependencies(detail(unsafe))),
    )
  }
})

test("customer order page renders a compact authenticated tracking block without public tracking endpoint", async () => {
  const page = await readFile(
    new URL("../app/minha-conta/pedidos/[id]/page.tsx", import.meta.url),
    "utf8",
  )

  assert.match(page, /Rastreamento/)
  assert.match(page, /order\.shipment/)
  assert.match(page, /trackingCode/)
  assert.match(page, /carrierName/)
  assert.match(page, /serviceName/)
  assert.match(page, /shipment\.timeline|order\.shipment\.timeline/)
  assert.match(page, /Preparando|Postado|Em trânsito|Entregue|Cancelado|Atenção/)
  assert.match(page, /requireCustomerPageAccess/)
  assert.doesNotMatch(page, /\/api\/tracking|\/rastreamento\/|public_token/)
})
