import assert from "node:assert/strict"
import test from "node:test"

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const
const SHIPMENT_ID = "11111111-1111-4111-8111-111111111111"
const ORDER_ID = "22222222-2222-4222-8222-222222222222"
const SENDER_ID = "33333333-3333-4333-8333-333333333333"

interface ShipmentRecord {
  id: string
  orderId: string
  senderProfileId: string
  senderProfileVersion: number
  provider: "melhor_envio"
  environment: "sandbox" | "production"
  documentMode: "declaration_content"
  state: string
  stableStateBeforeAttention: string | null
  serviceId: string
  serviceName: string
  carrierName: string
  customerShippingCents: number
  providerCostCents: number | null
  purchasedCostCents: number | null
  currency: "BRL"
  recipientSnapshot: Record<string, unknown>
  senderSnapshot: Record<string, unknown>
  packageSnapshot: Record<string, unknown>
  declarationItemsSnapshot: unknown[]
  providerCartId: string | null
  providerShipmentId: string | null
  providerOrderId: string | null
  trackingCode: string | null
  providerStatus: string | null
  lastTrackingSyncAt: string | null
  attentionReason: string | null
  operationKind: "prepare" | "purchase" | "generation" | "cancel" | "posting" | null
  operationId: string | null
  version: number
  createdAt: string
  updatedAt: string
}

type ShipmentRepositoryModule = {
  getShipmentById(id: string): Promise<ShipmentRecord | null>
  getActiveShipmentForOrder(orderId: string): Promise<ShipmentRecord | null>
}

async function loadModule(): Promise<ShipmentRepositoryModule> {
  const path = "../lib/server/shipments.ts"
  const module = (await import(path)) as Record<string, unknown>
  assert.equal(typeof module.getShipmentById, "function")
  assert.equal(typeof module.getActiveShipmentForOrder, "function")
  return module as unknown as ShipmentRepositoryModule
}

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

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: SHIPMENT_ID,
    order_id: ORDER_ID,
    sender_profile_id: SENDER_ID,
    sender_profile_version: 2,
    provider: "melhor_envio",
    environment: "sandbox",
    document_mode: "declaration_content",
    state: "in_cart",
    stable_state_before_attention: null,
    service_id: "3",
    service_name: ".Package",
    carrier_name: "Jadlog",
    customer_shipping_cents: 1990,
    provider_cost_cents: 1842,
    purchased_cost_cents: null,
    currency: "BRL",
    recipient_snapshot: { name: "Cliente", postalCode: "01001000" },
    sender_snapshot: { fullName: "Breno Bembem", postalCode: "86730000" },
    package_snapshot: { height: 4, width: 19, length: 25, weight: 0.25 },
    declaration_items_snapshot: [{ productId: 1, quantity: 1, unitValueCents: 11990 }],
    provider_cart_id: SHIPMENT_ID,
    provider_shipment_id: SHIPMENT_ID,
    provider_order_id: null,
    tracking_code: null,
    provider_status: "pending",
    last_tracking_sync_at: null,
    attention_reason: null,
    operation_kind: null,
    operation_id: null,
    version: 4,
    created_at: "2026-09-09T10:00:00.000Z",
    updated_at: "2026-09-09T10:05:00.000Z",
    ...overrides,
  }
}

function expected(overrides: Partial<ShipmentRecord> = {}): ShipmentRecord {
  return {
    id: SHIPMENT_ID,
    orderId: ORDER_ID,
    senderProfileId: SENDER_ID,
    senderProfileVersion: 2,
    provider: "melhor_envio",
    environment: "sandbox",
    documentMode: "declaration_content",
    state: "in_cart",
    stableStateBeforeAttention: null,
    serviceId: "3",
    serviceName: ".Package",
    carrierName: "Jadlog",
    customerShippingCents: 1990,
    providerCostCents: 1842,
    purchasedCostCents: null,
    currency: "BRL",
    recipientSnapshot: { name: "Cliente", postalCode: "01001000" },
    senderSnapshot: { fullName: "Breno Bembem", postalCode: "86730000" },
    packageSnapshot: { height: 4, width: 19, length: 25, weight: 0.25 },
    declarationItemsSnapshot: [{ productId: 1, quantity: 1, unitValueCents: 11990 }],
    providerCartId: SHIPMENT_ID,
    providerShipmentId: SHIPMENT_ID,
    providerOrderId: null,
    trackingCode: null,
    providerStatus: "pending",
    lastTrackingSyncAt: null,
    attentionReason: null,
    operationKind: null,
    operationId: null,
    version: 4,
    createdAt: "2026-09-09T10:00:00.000Z",
    updatedAt: "2026-09-09T10:05:00.000Z",
    ...overrides,
  }
}

function assertSafeShipmentSelect(url: URL) {
  assert.equal(url.pathname, "/rest/v1/shipments")
  assert.equal(url.searchParams.get("limit"), "1")
  const select = url.searchParams.get("select") ?? ""
  for (const required of [
    "id",
    "order_id",
    "sender_profile_id",
    "sender_profile_version",
    "provider",
    "environment",
    "document_mode",
    "state",
    "stable_state_before_attention",
    "service_id",
    "service_name",
    "carrier_name",
    "customer_shipping_cents",
    "provider_cost_cents",
    "purchased_cost_cents",
    "currency",
    "recipient_snapshot",
    "sender_snapshot",
    "package_snapshot",
    "declaration_items_snapshot",
    "provider_cart_id",
    "provider_shipment_id",
    "provider_order_id",
    "tracking_code",
    "provider_status",
    "last_tracking_sync_at",
    "attention_reason",
    "operation_kind",
    "operation_id",
    "version",
    "created_at",
    "updated_at",
  ]) {
    assert.ok(select.split(",").includes(required), `missing select ${required}`)
  }
  assert.doesNotMatch(select, /access_token|refresh_token|customer_id|payment_id|checkout_url/)
}

test("loads one shipment by canonical UUID using a bounded backend-only select", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await loadModule()
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        assertSafeShipmentSelect(url)
        assert.equal(url.searchParams.get("id"), `eq.${SHIPMENT_ID}`)
        assert.equal((init?.headers as Record<string, string>)?.apikey, "server-secret")
        assert.equal(init?.cache, "no-store")
        assert.ok(init?.signal instanceof AbortSignal)
        return Response.json([row()])
      },
    )

    assert.deepEqual(await module.getShipmentById(SHIPMENT_ID), expected())
  })
})

test("loads only the active non-canceled shipment for an order and returns null when none exists", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await loadModule()
    let calls = 0
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0]) => {
        calls += 1
        const url = new URL(String(input))
        assertSafeShipmentSelect(url)
        assert.equal(url.searchParams.get("order_id"), `eq.${ORDER_ID}`)
        assert.equal(url.searchParams.get("state"), "neq.canceled")
        assert.equal(url.searchParams.get("order"), "created_at.desc")
        return Response.json(calls === 1 ? [row()] : [])
      },
    )

    assert.deepEqual(await module.getActiveShipmentForOrder(ORDER_ID), expected())
    assert.equal(await module.getActiveShipmentForOrder(ORDER_ID), null)
  })
})

test("rejects malformed identifiers before any storage request", async (t) => {
  const module = await loadModule()
  let calls = 0
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1
    return Response.json([])
  })

  await assert.rejects(() => module.getShipmentById("not-a-uuid"))
  await assert.rejects(() => module.getActiveShipmentForOrder("not-a-uuid"))
  assert.equal(calls, 0)
})

test("strictly rejects malformed shipment rows, illegal operation pairs and impossible attention state", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await loadModule()
    const malformed = [
      row({ provider: "invented" }),
      row({ environment: "invented" }),
      row({ document_mode: "invoice" }),
      row({ state: "invented" }),
      row({ version: 0 }),
      row({ provider_cost_cents: -1 }),
      row({ declaration_items_snapshot: [] }),
      row({ operation_kind: "purchase", operation_id: null }),
      row({ operation_kind: null, operation_id: SHIPMENT_ID }),
      row({ state: "attention_required", attention_reason: null }),
      row({ state: "in_cart", attention_reason: "purchase_outcome_unknown" }),
      row({ stable_state_before_attention: "purchase_pending" }),
      row({ created_at: "not-a-date" }),
    ]
    let index = 0
    t.mock.method(globalThis, "fetch", async () => Response.json([malformed[index++]]))

    for (const _value of malformed) {
      await assert.rejects(() => module.getShipmentById(SHIPMENT_ID))
    }
  })
})

test("accepts attention state only with a stable persisted state and reason", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await loadModule()
    t.mock.method(globalThis, "fetch", async () =>
      Response.json([
        row({
          state: "attention_required",
          stable_state_before_attention: "in_cart",
          attention_reason: "purchase_outcome_unknown",
          operation_kind: null,
          operation_id: null,
        }),
      ]),
    )

    assert.deepEqual(
      await module.getShipmentById(SHIPMENT_ID),
      expected({
        state: "attention_required",
        stableStateBeforeAttention: "in_cart",
        attentionReason: "purchase_outcome_unknown",
      }),
    )
  })
})

test("rejects duplicate rows and sanitizes storage/network failures", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await loadModule()
    let calls = 0
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1
      if (calls === 1) return Response.json([row(), row()])
      if (calls === 2) {
        return Response.json({ message: "database secret detail" }, { status: 500 })
      }
      throw new Error("network secret detail")
    })

    await assert.rejects(() => module.getShipmentById(SHIPMENT_ID))
    await assert.rejects(
      () => module.getShipmentById(SHIPMENT_ID),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "Shipment storage request failed" &&
        !error.message.includes("secret"),
    )
    await assert.rejects(
      () => module.getShipmentById(SHIPMENT_ID),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "Shipment storage request failed" &&
        !error.message.includes("secret"),
    )
  })
})
