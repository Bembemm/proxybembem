import assert from "node:assert/strict"
import test from "node:test"
import {
  OrderConflictError,
  createOrder,
  getOrderByCheckoutAttemptId,
} from "../lib/server/orders.ts"

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const
const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440123"

async function withSupabaseEnv(run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])
  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "server-secret"

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

const orderInput = {
  orderNumber: "PB-A1B2C3D4E5F6",
  publicToken: "a".repeat(64),
  customerName: "Breno Bembem",
  customerEmail: "cliente@example.com",
  customerId: CUSTOMER_ID,
  whatsapp: "44991250332",
  cep: "86730000",
  address: {
    street: "Rua das Cartas",
    number: "123",
    complement: "",
    neighborhood: "Centro",
    city: "Astorga",
    state: "PR",
  },
  items: [
    {
      productId: 1,
      title: "Deck Commander Proxy 100 Cartas",
      unitPriceCents: 11990,
      quantity: 1,
      shipping: { weightKg: 0.25, lengthCm: 25, widthCm: 19, heightCm: 4 },
    },
  ],
  subtotalCents: 11990,
  shipping: {
    provider: "melhor_envio",
    serviceId: "1",
    serviceName: "PAC",
    carrierName: "Correios",
    deliveryDays: 6,
    amountCents: 1842,
    snapshot: { packages: [{ id: "volume-1" }] },
  },
  totalCents: 13832,
  checkoutAttemptId: "550e8400-e29b-41d4-a716-446655440000",
  checkoutFingerprint: "b".repeat(64),
}

test("persists complete address, shipping, total, checkout identity and owned customer snapshot", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        assert.deepEqual(body, {
          order_number: orderInput.orderNumber,
          public_token: orderInput.publicToken,
          customer_name: orderInput.customerName,
          customer_email: "cliente@example.com",
          customer_id: CUSTOMER_ID,
          whatsapp: orderInput.whatsapp,
          cep: orderInput.cep,
          address_street: "Rua das Cartas",
          address_number: "123",
          address_complement: "",
          address_neighborhood: "Centro",
          address_city: "Astorga",
          address_state: "PR",
          items: orderInput.items,
          subtotal_cents: 11990,
          shipping_provider: "melhor_envio",
          shipping_service_id: "1",
          shipping_service_name: "PAC",
          shipping_carrier_name: "Correios",
          shipping_delivery_days: 6,
          shipping_cents: 1842,
          total_cents: 13832,
          shipping_snapshot: { packages: [{ id: "volume-1" }] },
          checkout_attempt_id: "550e8400-e29b-41d4-a716-446655440000",
          checkout_fingerprint: "b".repeat(64),
          payment_provider: "mercadopago",
          payment_status: "pending",
        })
        return new Response(
          JSON.stringify([
            {
              ...body,
              id: "order-id",
              fulfillment_status: "awaiting_payment",
            },
          ]),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        )
      },
    )

    await createOrder(orderInput)
  })
})

test("persists trusted authenticated customer ownership when supplied by server flow", async (t) => {
  await withSupabaseEnv(async () => {
    const customerId = "550e8400-e29b-41d4-a716-446655440999"

    t.mock.method(
      globalThis,
      "fetch",
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        assert.equal(body.customer_email, "conta@example.com")
        assert.equal(body.customer_id, customerId)
        return new Response(
          JSON.stringify([
            {
              ...body,
              id: "order-id-auth",
              fulfillment_status: "awaiting_payment",
            },
          ]),
          { status: 201, headers: { "Content-Type": "application/json" } },
        )
      },
    )

    await createOrder({
      ...orderInput,
      customerEmail: "conta@example.com",
      customerId,
      checkoutAttemptId: "550e8400-e29b-41d4-a716-446655440001",
    })
  })
})

test("loads an order by checkout attempt ID", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input))
      assert.equal(
        url.searchParams.get("checkout_attempt_id"),
        "eq.550e8400-e29b-41d4-a716-446655440000",
      )
      assert.equal(url.searchParams.get("limit"), "1")
      return new Response("[]", { status: 200 })
    })

    assert.equal(
      await getOrderByCheckoutAttemptId("550e8400-e29b-41d4-a716-446655440000"),
      null,
    )
  })
})

test("maps checkout attempt unique violations to a typed conflict", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            code: "23505",
            message:
              'duplicate key value violates unique constraint "orders_checkout_attempt_id_uidx"',
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
    )

    await assert.rejects(
      () => createOrder(orderInput),
      (error: unknown) =>
        error instanceof OrderConflictError && error.code === "checkout_attempt_conflict",
    )
  })
})
