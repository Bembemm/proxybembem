import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  getAdminOrderById,
  listAdminOrders,
} from "../lib/server/admin-orders.ts"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const
const ORDER_ID = "11111111-1111-4111-8111-111111111111"
const LEGACY_ORDER_NUMBER = "T14-2004298F4CFB"

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

function listRow() {
  return {
    id: ORDER_ID,
    order_number: LEGACY_ORDER_NUMBER,
    customer_name: "Cliente Teste",
    whatsapp: "5511999999999",
    subtotal_cents: 11990,
    total_cents: 13832,
    payment_status: "pending",
    fulfillment_status: "awaiting_payment",
    created_at: "2026-09-06T19:19:24.27264+00:00",
    updated_at: "2026-09-06T19:19:24.27264+00:00",
    open_attention_count: 0,
    open_attention_severity: null,
  }
}

function detailRow() {
  return {
    id: ORDER_ID,
    order_number: LEGACY_ORDER_NUMBER,
    customer_name: "Cliente Teste",
    customer_email: null,
    whatsapp: "5511999999999",
    cep: "01310100",
    address_street: "Avenida Paulista",
    address_number: "1000",
    address_complement: null,
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
    shipping_provider: null,
    shipping_service_id: null,
    shipping_service_name: null,
    shipping_carrier_name: null,
    shipping_delivery_days: null,
    shipping_cents: null,
    shipping_snapshot: null,
    total_cents: 13832,
    payment_provider: "mercadopago",
    preference_id: null,
    payment_id: null,
    payment_status: "pending",
    payment_status_detail: null,
    fulfillment_status: "awaiting_payment",
    created_at: "2026-09-06T19:19:24.27264+00:00",
    updated_at: "2026-09-06T19:19:24.27264+00:00",
  }
}

test("admin login reports invalid credentials explicitly", async () => {
  const form = await source("../app/admin/login/login-form.tsx")
  assert.match(form, /E-mail ou senha incorretos\./)
})

test("all admin responses opt out of browser and reverse-proxy caching", async () => {
  const proxy = await source("../lib/supabase/proxy.ts")
  assert.match(proxy, /PRIVATE_ADMIN_CACHE_CONTROL/)
  assert.match(proxy, /pathname\.startsWith\(["']\/admin["']\)/)
  assert.match(proxy, /private,\s*no-cache,\s*no-store,\s*max-age=0,\s*must-revalidate/i)
})

test("admin order repository accepts bounded non-PB order numbers returned by storage", async (t) => {
  await withSupabaseEnv(async () => {
    let calls = 0
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1
      if (calls === 1) {
        return new Response(JSON.stringify({ orders: [listRow()], total: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      return new Response(JSON.stringify([detailRow()]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    })

    const list = await listAdminOrders({})
    assert.equal(list.orders[0]?.order_number, LEGACY_ORDER_NUMBER)

    const detail = await getAdminOrderById(ORDER_ID)
    assert.equal(detail?.order_number, LEGACY_ORDER_NUMBER)
  })
})
