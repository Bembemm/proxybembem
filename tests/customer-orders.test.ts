import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  getOwnOrderByIdWithDependencies,
  listOwnOrdersWithDependencies,
  type CustomerOrderDependencies,
} from "../lib/server/customer-orders.ts"

const ORDER_ID = "550e8400-e29b-41d4-a716-446655440000"
const CREATED_AT = "2026-09-02T12:00:00.000Z"
const UPDATED_AT = "2026-09-02T13:00:00.000Z"

function summary(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    order_number: "PB-A1B2C3D4E5F6",
    subtotal_cents: 11990,
    total_cents: 13490,
    payment_status: "approved",
    fulfillment_status: "awaiting_production",
    created_at: CREATED_AT,
    shipping_service_name: "PAC",
    shipping_carrier_name: "Correios",
    shipping_delivery_days: 5,
    ...overrides,
  }
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    order_number: "PB-A1B2C3D4E5F6",
    items: [
      {
        productId: 1,
        title: "Deck Commander Proxy 100 Cartas",
        unitPriceCents: 11990,
        quantity: 1,
        shipping: {
          weightKg: 0.25,
          lengthCm: 20,
          widthCm: 15,
          heightCm: 2,
        },
      },
    ],
    subtotal_cents: 11990,
    shipping_cents: 1500,
    total_cents: 13490,
    payment_status: "approved",
    fulfillment_status: "awaiting_production",
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
    timeline: [
      { kind: "payment_approved", created_at: CREATED_AT },
      { kind: "production_started", created_at: UPDATED_AT },
    ],
    ...overrides,
  }
}

function dependencies(input?: {
  listResult?: unknown
  detailResult?: unknown
  calls?: Array<{ operation: string; value: unknown }>
}): CustomerOrderDependencies {
  return {
    async listOrders(params) {
      input?.calls?.push({ operation: "list", value: params })
      return input?.listResult ?? { orders: [summary()], total: 1 }
    },
    async getOrder(orderId) {
      input?.calls?.push({ operation: "detail", value: orderId })
      return input?.detailResult === undefined ? detail() : input.detailResult
    },
  }
}

test("list uses bounded page/pageSize and sends only limit plus offset", async () => {
  const calls: Array<{ operation: string; value: unknown }> = []
  const result = await listOwnOrdersWithDependencies(
    { page: 2, pageSize: 10 },
    dependencies({ calls }),
  )

  assert.deepEqual(calls, [{ operation: "list", value: { limit: 10, offset: 10 } }])
  assert.equal(result.page, 2)
  assert.equal(result.pageSize, 10)
  assert.equal(result.total, 1)
  assert.equal(result.orders.length, 1)

  for (const invalid of [
    { page: 0 },
    { page: 1.5 },
    { pageSize: 0 },
    { pageSize: 51 },
    { pageSize: 1.5 },
    { page: 10002, pageSize: 1 },
  ]) {
    await assert.rejects(() =>
      listOwnOrdersWithDependencies(invalid, dependencies({ calls: [] })),
    )
  }
})

test("list strictly maps curated summary rows while preserving bounded future payment status", async () => {
  const result = await listOwnOrdersWithDependencies(
    undefined,
    dependencies({
      listResult: {
        orders: [summary({ payment_status: "provider_future_status" })],
        total: 1,
      },
    }),
  )

  assert.deepEqual(result, {
    orders: [
      {
        id: ORDER_ID,
        orderNumber: "PB-A1B2C3D4E5F6",
        subtotalCents: 11990,
        totalCents: 13490,
        paymentStatus: "provider_future_status",
        fulfillmentStatus: "awaiting_production",
        createdAt: CREATED_AT,
        shippingServiceName: "PAC",
        shippingCarrierName: "Correios",
        shippingDeliveryDays: 5,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 25,
  })
})

test("detail accepts only canonical order UUID input and sends no customer identity", async () => {
  const calls: Array<{ operation: string; value: unknown }> = []
  const result = await getOwnOrderByIdWithDependencies(ORDER_ID, dependencies({ calls }))

  assert.equal(result?.id, ORDER_ID)
  assert.deepEqual(calls, [{ operation: "detail", value: ORDER_ID }])

  for (const invalid of [
    "not-a-uuid",
    "00000000-0000-0000-0000-000000000000",
    "550e8400-e29b-41d4-a716-44665544000",
  ]) {
    await assert.rejects(() =>
      getOwnOrderByIdWithDependencies(invalid, dependencies({ calls: [] })),
    )
  }
})

test("detail returns null for missing or other-owned order", async () => {
  assert.equal(
    await getOwnOrderByIdWithDependencies(
      ORDER_ID,
      dependencies({ detailResult: null }),
    ),
    null,
  )
})

test("detail strictly maps customer-safe immutable order data and timeline", async () => {
  const result = await getOwnOrderByIdWithDependencies(ORDER_ID, dependencies())

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
    fulfillmentStatus: "awaiting_production",
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
    timeline: [
      { kind: "payment_approved", createdAt: CREATED_AT },
      { kind: "production_started", createdAt: UPDATED_AT },
    ],
  })
})

test("malformed or overbroad RPC data is rejected instead of leaking internals", async () => {
  for (const listResult of [
    { orders: [summary({ public_token: "secret" })], total: 1 },
    { orders: [summary({ payment_status: "<script>" })], total: 1 },
    { orders: [summary({ fulfillment_status: "invented" })], total: 1 },
    { orders: [summary()], total: -1 },
  ]) {
    await assert.rejects(() =>
      listOwnOrdersWithDependencies(undefined, dependencies({ listResult })),
    )
  }

  for (const detailResult of [
    detail({ payment_id: "123" }),
    detail({ preference_id: "pref" }),
    detail({ public_token: "secret" }),
    detail({ checkout_url: "https://example.com" }),
    detail({ shipping_snapshot: {} }),
    detail({ timeline: [{ kind: "raw_internal_event", created_at: CREATED_AT }] }),
  ]) {
    await assert.rejects(() =>
      getOwnOrderByIdWithDependencies(ORDER_ID, dependencies({ detailResult })),
    )
  }
})

test("production repository uses authenticated SSR RPCs and never passes customer UUID", async () => {
  const source = await readFile(
    new URL("../lib/server/customer-orders.ts", import.meta.url),
    "utf8",
  )

  assert.match(source, /createSupabaseServerClient/)
  assert.match(source, /rpc\(\s*["']customer_list_orders["']/)
  assert.match(source, /p_limit/)
  assert.match(source, /p_offset/)
  assert.match(source, /rpc\(\s*["']customer_get_order["']/)
  assert.match(source, /p_order_id/)
  assert.doesNotMatch(
    source,
    /customer[_A-Z]?id|p_customer_id|ADMIN_USER_ID|supabaseSecretKey|getSupabaseEnv/,
  )
})
