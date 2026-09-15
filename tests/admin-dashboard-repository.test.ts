import assert from "node:assert/strict"
import test from "node:test"
import {
  getAdminDashboardSnapshot,
  getAttentionReasonLabel,
} from "../lib/server/admin-dashboard.ts"

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const
const ORDER_ID = "11111111-1111-4111-8111-111111111111"

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

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    asOf: "2026-09-15T12:00:00.000Z",
    timezone: "America/Sao_Paulo",
    ordersCreated: { today: 2, week: 4, month: 7 },
    approvedGrossCents: { today: 11990, week: 23980, month: 59950 },
    reversedCents: { today: 0, week: 11990, month: 11990 },
    financialRisk: { manualReview: 1, refunded: 1, chargedBack: 0 },
    operations: {
      awaitingProduction: 2,
      inProduction: 1,
      readyToShip: 1,
      shipped: 3,
    },
    attention: {
      totalOrders: 1,
      criticalOrders: 1,
      warningOrders: 0,
      infoOrders: 0,
      topItems: [
        {
          orderId: ORDER_ID,
          orderNumber: "PB-A1B2C3D4E5F6",
          customerName: "Cliente Teste",
          severity: "critical",
          flagCount: 2,
          primaryCode: "payment_manual_review",
          primarySource: "mercadopago",
          openedAt: "2026-09-15T11:00:00.000Z",
        },
      ],
    },
    productsThisMonth: [
      { productId: 1, title: "Deck Commander Proxy 100 Cartas", quantity: 3 },
    ],
    ...overrides,
  }
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

test("loads one strict no-store dashboard snapshot from the service-role RPC", async (t) => {
  await withSupabaseEnv(async () => {
    const expected = snapshot()
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        assert.equal(
          String(input),
          "https://example.supabase.co/rest/v1/rpc/admin_get_dashboard_snapshot",
        )
        assert.equal(init?.method, "POST")
        assert.equal(init?.cache, "no-store")
        assert.equal((init?.headers as Record<string, string>)?.apikey, "server-secret")
        assert.deepEqual(JSON.parse(String(init?.body)), {})
        assert.ok(init?.signal instanceof AbortSignal)
        return response(expected)
      },
    )

    assert.deepEqual(await getAdminDashboardSnapshot(), expected)
  })
})

test("rejects malformed dashboard snapshot structures instead of coercing values", async (t) => {
  await withSupabaseEnv(async () => {
    const base = snapshot()
    const baseAttention = base.attention as Record<string, unknown>
    const baseItem = (baseAttention.topItems as unknown[])[0] as Record<string, unknown>
    const baseProduct = (base.productsThisMonth as unknown[])[0] as Record<string, unknown>
    const payloads: unknown[] = [
      [],
      snapshot({ timezone: "UTC" }),
      snapshot({ asOf: "not-a-date" }),
      snapshot({ ordersCreated: { today: -1, week: 4, month: 7 } }),
      snapshot({ approvedGrossCents: { today: 1.2, week: 2, month: 3 } }),
      snapshot({ reversedCents: { today: 0, week: Number.MAX_SAFE_INTEGER + 1, month: 0 } }),
      snapshot({
        attention: { ...baseAttention, totalOrders: 2 },
      }),
      snapshot({
        attention: {
          ...baseAttention,
          topItems: Array.from({ length: 6 }, () => ({ ...baseItem })),
        },
      }),
      snapshot({
        attention: {
          ...baseAttention,
          topItems: [{ ...baseItem, orderId: "not-a-uuid" }],
        },
      }),
      snapshot({
        attention: {
          ...baseAttention,
          topItems: [{ ...baseItem, severity: "urgent" }],
        },
      }),
      snapshot({
        attention: {
          ...baseAttention,
          topItems: [{ ...baseItem, flagCount: 0 }],
        },
      }),
      snapshot({
        attention: {
          ...baseAttention,
          topItems: [{ ...baseItem, openedAt: "invalid" }],
        },
      }),
      snapshot({
        attention: {
          ...baseAttention,
          topItems: [{ ...baseItem, primaryCode: "x".repeat(65) }],
        },
      }),
      snapshot({
        productsThisMonth: Array.from({ length: 11 }, () => ({ ...baseProduct })),
      }),
      snapshot({ productsThisMonth: [{ ...baseProduct, productId: 0 }] }),
      snapshot({ productsThisMonth: [{ ...baseProduct, quantity: 0 }] }),
      snapshot({ productsThisMonth: [{ ...baseProduct, title: "" }] }),
    ]

    let index = 0
    t.mock.method(globalThis, "fetch", async () => response(payloads[index++]))

    for (const _payload of payloads) {
      await assert.rejects(() => getAdminDashboardSnapshot())
    }
  })
})

test("sanitizes dashboard storage and network failures", async (t) => {
  await withSupabaseEnv(async () => {
    let mode: "http" | "network" = "http"
    t.mock.method(globalThis, "fetch", async () => {
      if (mode === "network") throw new Error("secret transport body")
      return new Response("provider secret body", { status: 500 })
    })

    await assert.rejects(
      () => getAdminDashboardSnapshot(),
      (error: unknown) =>
        error instanceof Error && error.message === "Admin dashboard storage request failed",
    )

    mode = "network"
    await assert.rejects(
      () => getAdminDashboardSnapshot(),
      (error: unknown) =>
        error instanceof Error && error.message === "Admin dashboard storage request failed",
    )
  })
})

test("maps known attention codes to safe Portuguese labels with generic unknown fallback", () => {
  assert.equal(getAttentionReasonLabel("payment_manual_review"), "Pagamento precisa de revisão")
  assert.equal(getAttentionReasonLabel("payment_refunded"), "Pagamento reembolsado")
  assert.equal(
    getAttentionReasonLabel("payment_charged_back"),
    "Pagamento contestado (chargeback)",
  )
  assert.equal(getAttentionReasonLabel("canceled_paid_order"), "Pedido pago foi cancelado")
  assert.equal(getAttentionReasonLabel("future_internal_code"), "Pedido requer atenção")
})
