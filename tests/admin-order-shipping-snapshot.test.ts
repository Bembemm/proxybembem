import assert from "node:assert/strict"
import test from "node:test"
import { getAdminOrderById } from "../lib/server/admin-orders.ts"

const ORDER_ID = "11111111-1111-4111-8111-111111111111"
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

function detailRow() {
  return {
    id: ORDER_ID,
    order_number: "PB-A1B2C3D4E5F6",
    customer_name: "Cliente Teste",
    customer_email: "cliente@example.com",
    whatsapp: "5511999999999",
    cep: "01310100",
    address_street: "Avenida Paulista",
    address_number: "1000",
    address_complement: null,
    address_neighborhood: "Bela Vista",
    address_city: "São Paulo",
    address_state: "SP",
    items: [{
      productId: 1,
      title: "Deck Commander Proxy 100 Cartas",
      unitPriceCents: 11990,
      quantity: 1,
      shipping: { weightKg: 0.25, lengthCm: 18, widthCm: 13, heightCm: 4 },
    }],
    subtotal_cents: 11990,
    shipping_provider: "melhor_envio",
    shipping_service_id: "2",
    shipping_service_name: "SEDEX",
    shipping_carrier_name: "Correios",
    shipping_delivery_days: 3,
    shipping_cents: 1842,
    shipping_snapshot: {
      destinationCep: "01310100",
      service: { id: "2", name: "SEDEX", carrier: "Correios", priceCents: 1842, deliveryDays: 3 },
      packages: [],
      products: [],
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
  }
}

test("admin order detail retrieves raw shipping_snapshot only for server-side shipment validation", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0]) => {
        const url = new URL(String(input))
        const select = (url.searchParams.get("select") ?? "").split(",")
        assert.ok(select.includes("shipping_snapshot"))
        for (const forbidden of ["public_token", "checkout_url", "checkout_fingerprint"]) {
          assert.ok(!select.includes(forbidden), `must not load ${forbidden}`)
        }
        return Response.json([detailRow()])
      },
    )

    const detail = await getAdminOrderById(ORDER_ID)
    const rawSnapshot = (detail as (typeof detail & { shipping_snapshot?: unknown }) | null)
      ?.shipping_snapshot
    assert.deepEqual(rawSnapshot, detailRow().shipping_snapshot)
  })
})
