import assert from "node:assert/strict"
import test from "node:test"
import {
  getAdminOrderById,
  listAdminOrders,
} from "../lib/server/admin-orders.ts"

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const

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

const ORDER_ID = "11111111-1111-4111-8111-111111111111"

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    order_number: "PB-A1B2C3D4E5F6",
    customer_name: "Cliente Teste",
    whatsapp: "5511999999999",
    subtotal_cents: 11990,
    total_cents: 13832,
    payment_status: "approved",
    fulfillment_status: "awaiting_production",
    created_at: "2026-09-02T12:00:00.000Z",
    updated_at: "2026-09-02T12:01:00.000Z",
    open_attention_count: 1,
    open_attention_severity: "warning",
    ...overrides,
  }
}

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    order_number: "PB-A1B2C3D4E5F6",
    customer_name: "Cliente Teste",
    customer_email: "cliente@example.com",
    customer_cpf: null,
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
    shipping_snapshot: null,
    total_cents: 13832,
    payment_provider: "mercadopago",
    preference_id: "pref-123",
    payment_id: "175133542535",
    payment_status: "approved",
    payment_status_detail: "accredited",
    fulfillment_status: "awaiting_production",
    created_at: "2026-09-02T12:00:00.000Z",
    updated_at: "2026-09-02T12:01:00.000Z",
    ...overrides,
  }
}

test("lists admin orders through the bounded RPC with normalized defaults", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        assert.equal(
          String(input),
          "https://example.supabase.co/rest/v1/rpc/admin_list_orders",
        )
        assert.equal(init?.method, "POST")
        assert.equal((init?.headers as Record<string, string>)?.apikey, "server-secret")
        assert.equal(init?.cache, "no-store")
        assert.deepEqual(JSON.parse(String(init?.body)), {
          p_query: null,
          p_payment_status: null,
          p_fulfillment_status: null,
          p_attention_required: null,
          p_from_date: null,
          p_to_date: null,
          p_sort: "newest",
          p_limit: 25,
          p_offset: 0,
        })

        return new Response(
          JSON.stringify({ orders: [listRow()], total: 1 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      },
    )

    assert.deepEqual(await listAdminOrders({}), {
      orders: [listRow()],
      total: 1,
      page: 1,
      pageSize: 25,
    })
  })
})

test("normalizes filters while allowing future provider payment status display values", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        assert.deepEqual(JSON.parse(String(init?.body)), {
          p_query: "PB-A1B2",
          p_payment_status: "future_provider_status_2",
          p_fulfillment_status: "in_production",
          p_attention_required: true,
          p_from_date: "2026-09-01",
          p_to_date: "2026-09-02",
          p_sort: "oldest",
          p_limit: 10,
          p_offset: 20,
        })

        return new Response(
          JSON.stringify({
            orders: [listRow({ payment_status: "future_provider_status_2" })],
            total: 21,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      },
    )

    const result = await listAdminOrders({
      query: "  PB-A1B2  ",
      paymentStatus: "future_provider_status_2",
      fulfillmentStatus: "in_production",
      attentionRequired: true,
      from: "2026-09-01",
      to: "2026-09-02",
      sort: "oldest",
      page: 3,
      pageSize: 10,
    })

    assert.equal(result.orders[0]?.payment_status, "future_provider_status_2")
    assert.equal(result.total, 21)
    assert.equal(result.page, 3)
    assert.equal(result.pageSize, 10)
  })
})

test("rejects malformed list input before any storage request", async (t) => {
  let calls = 0
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1
    return new Response("{}", { status: 200 })
  })

  const invalidInputs = [
    { page: 0 },
    { page: 1.2 },
    { pageSize: 0 },
    { pageSize: 51 },
    { query: "x".repeat(1001) },
    { paymentStatus: "approved;drop table orders" },
    { paymentStatus: "x".repeat(101) },
    { fulfillmentStatus: "invented" },
    { from: "2026-9-01" },
    { to: "2026-02-30" },
    { from: "2026-09-03", to: "2026-09-02" },
    { sort: "random" },
    { attentionRequired: "yes" },
  ] as const

  for (const input of invalidInputs) {
    await assert.rejects(() => listAdminOrders(input as never))
  }
  assert.equal(calls, 0)
})

test("strictly rejects malformed list RPC responses", async (t) => {
  await withSupabaseEnv(async () => {
    const payloads: unknown[] = [
      [],
      { orders: [], total: -1 },
      { orders: [], total: 1.5 },
      { orders: "not-an-array", total: 0 },
      { orders: [listRow({ fulfillment_status: "invented" })], total: 1 },
      { orders: [listRow({ open_attention_count: -1 })], total: 1 },
      { orders: [listRow({ open_attention_severity: "urgent" })], total: 1 },
      { orders: [listRow({ subtotal_cents: 1.5 })], total: 1 },
    ]

    let index = 0
    t.mock.method(globalThis, "fetch", async () => {
      const payload = payloads[index++]
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    })

    for (const _payload of payloads) {
      await assert.rejects(() => listAdminOrders({}))
    }
  })
})

test("loads one admin order by canonical UUID using only the approved detail select", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        assert.equal(url.origin, "https://example.supabase.co")
        assert.equal(url.pathname, "/rest/v1/orders")
        assert.equal(url.searchParams.get("id"), `eq.${ORDER_ID}`)
        assert.equal(url.searchParams.get("limit"), "1")
        assert.equal(init?.cache, "no-store")

        const select = url.searchParams.get("select") ?? ""
        for (const field of [
          "id",
          "order_number",
          "customer_name",
          "customer_email",
          "customer_cpf",
          "whatsapp",
          "cep",
          "items",
          "shipping_snapshot",
          "total_cents",
          "payment_status",
          "payment_status_detail",
          "fulfillment_status",
          "created_at",
          "updated_at",
        ]) {
          assert.ok(select.split(",").includes(field), `missing ${field}`)
        }
        for (const forbidden of [
          "public_token",
          "customer_id",
          "checkout_attempt_id",
          "checkout_fingerprint",
          "checkout_url",
        ]) {
          assert.ok(!select.split(",").includes(forbidden), `leaked ${forbidden}`)
        }

        return new Response(JSON.stringify([detailRow()]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      },
    )

    assert.deepEqual(await getAdminOrderById(ORDER_ID), detailRow())
  })
})

test("returns null for a missing detail and rejects malformed IDs or rows", async (t) => {
  await withSupabaseEnv(async () => {
    let calls = 0
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1
      if (calls === 1) return new Response("[]", { status: 200 })
      return new Response(
        JSON.stringify([detailRow({ fulfillment_status: "invented" })]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    })

    assert.equal(await getAdminOrderById(ORDER_ID), null)
    await assert.rejects(() => getAdminOrderById(ORDER_ID.replace("4111", "6111")))
    assert.equal(calls, 1)
    await assert.rejects(() => getAdminOrderById(ORDER_ID))
    assert.equal(calls, 2)
  })
})

test("sanitizes storage and network failures", async (t) => {
  await withSupabaseEnv(async () => {
    let calls = 0
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1
      if (calls === 1) {
        return new Response(JSON.stringify({ message: "secret database detail" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }
      throw new Error("network contained secret")
    })

    await assert.rejects(
      () => listAdminOrders({}),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "Admin order storage request failed" &&
        !error.message.includes("secret"),
    )

    await assert.rejects(
      () => getAdminOrderById(ORDER_ID),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "Admin order storage request failed" &&
        !error.message.includes("secret"),
    )
  })
})