import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { NextRequest } from "next/server.js"

const SHIPMENT_ID = "11111111-1111-4111-8111-111111111111"
const ORDER_ID = "22222222-2222-4222-8222-222222222222"
const ADMIN_ID = "33333333-3333-4333-8333-333333333333"
const AUTH_SESSION_ID = "44444444-4444-4444-8444-444444444444"
const ENV_KEYS = ["NEXT_PUBLIC_SITE_URL"] as const

type AdminAccessResult =
  | {
      ok: true
      principal: { userId: string; authSessionId: string; aal: "aal2" }
    }
  | { ok: false; reason: string }

type PurchaseResult = {
  outcome: string
  shipmentId?: string
  orderId?: string
  providerCostCents?: number
  purchasedCostCents?: number
  reason?: string
}

interface PurchaseActionDependencies {
  authorizeAdmin(): Promise<AdminAccessResult>
  consumeRateLimit(request: NextRequest): Promise<boolean>
  purchaseShipment(input: {
    shipmentId: string
    adminUserId: string
    expectedCostCents: number
  }): Promise<PurchaseResult>
}

interface ReconcileActionDependencies {
  authorizeAdmin(): Promise<AdminAccessResult>
  consumeRateLimit(request: NextRequest): Promise<boolean>
  reconcileShipment(input: {
    shipmentId: string
    adminUserId: string
  }): Promise<PurchaseResult>
}

type HandlerContext = { params: Promise<{ id: string }> }

type Module = {
  createAdminShipmentPurchaseActionHandler(
    deps: PurchaseActionDependencies,
  ): (request: NextRequest, context: HandlerContext) => Promise<Response>
  createAdminShipmentReconcileActionHandler(
    deps: ReconcileActionDependencies,
  ): (request: NextRequest, context: HandlerContext) => Promise<Response>
}

async function loadModule(): Promise<Module> {
  return (await import("../lib/server/admin-shipment-actions.ts")) as Module
}

function principal(): AdminAccessResult {
  return {
    ok: true,
    principal: { userId: ADMIN_ID, authSessionId: AUTH_SESSION_ID, aal: "aal2" },
  }
}

async function withPreviewEnv(run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])
  process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example"
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

function purchaseRequest(input: {
  origin?: string
  fields?: Record<string, string>
} = {}) {
  const body = new URLSearchParams({
    expectedCostCents: "1842",
    providerShipmentId: "browser-provider-id",
    environment: "sandbox",
    orderId: "browser-order-id",
    ...input.fields,
  })
  return new NextRequest(
    `https://preview.example/api/internal/admin/shipments/${SHIPMENT_ID}/purchase`,
    {
      method: "POST",
      headers: {
        origin: input.origin ?? "https://preview.example",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    },
  )
}

function reconcileRequest(origin = "https://preview.example") {
  return new NextRequest(
    `https://preview.example/api/internal/admin/shipments/${SHIPMENT_ID}/reconcile`,
    {
      method: "POST",
      headers: { origin },
    },
  )
}

function context(id = SHIPMENT_ID): HandlerContext {
  return { params: Promise.resolve({ id }) }
}

function purchaseDeps(
  overrides: Partial<PurchaseActionDependencies> = {},
): PurchaseActionDependencies {
  return {
    authorizeAdmin: async () => principal(),
    consumeRateLimit: async () => true,
    purchaseShipment: async () => ({
      outcome: "purchased",
      shipmentId: SHIPMENT_ID,
      orderId: ORDER_ID,
      purchasedCostCents: 1842,
    }),
    ...overrides,
  }
}

function reconcileDeps(
  overrides: Partial<ReconcileActionDependencies> = {},
): ReconcileActionDependencies {
  return {
    authorizeAdmin: async () => principal(),
    consumeRateLimit: async () => true,
    reconcileShipment: async () => ({
      outcome: "reconciled_purchased",
      shipmentId: SHIPMENT_ID,
      orderId: ORDER_ID,
      purchasedCostCents: 1842,
    }),
    ...overrides,
  }
}

function assertPrivateNoStore(response: Response) {
  assert.match(response.headers.get("cache-control") ?? "", /private/i)
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i)
  assert.equal(response.headers.get("pragma"), "no-cache")
}

test("purchase rejects cross-site requests before spend rate limit, auth or service", async () => {
  await withPreviewEnv(async () => {
    const module = await loadModule()
    const calls: string[] = []
    const POST = module.createAdminShipmentPurchaseActionHandler(
      purchaseDeps({
        consumeRateLimit: async () => {
          calls.push("rate")
          return true
        },
        authorizeAdmin: async () => {
          calls.push("auth")
          return principal()
        },
        purchaseShipment: async () => {
          calls.push("purchase")
          return { outcome: "purchased", orderId: ORDER_ID, shipmentId: SHIPMENT_ID }
        },
      }),
    )

    const response = await POST(purchaseRequest({ origin: "https://evil.example" }), context())
    assert.equal(response.status, 403)
    assert.deepEqual(calls, [])
    assertPrivateNoStore(response)
  })
})

test("purchase uses the spend bucket before active AAL2 admin authorization", async () => {
  await withPreviewEnv(async () => {
    const module = await loadModule()
    const calls: string[] = []
    const POST = module.createAdminShipmentPurchaseActionHandler(
      purchaseDeps({
        consumeRateLimit: async () => {
          calls.push("rate")
          return false
        },
        authorizeAdmin: async () => {
          calls.push("auth")
          return principal()
        },
      }),
    )

    const response = await POST(purchaseRequest(), context())
    assert.equal(response.status, 429)
    assert.equal(response.headers.get("retry-after"), "300")
    assert.deepEqual(calls, ["rate"])
    assertPrivateNoStore(response)
  })
})

test("purchase accepts only path shipment id, authenticated admin id and exact confirmed cents", async () => {
  await withPreviewEnv(async () => {
    const module = await loadModule()
    const inputs: unknown[] = []
    const POST = module.createAdminShipmentPurchaseActionHandler(
      purchaseDeps({
        purchaseShipment: async (input) => {
          inputs.push(input)
          return {
            outcome: "purchased",
            shipmentId: SHIPMENT_ID,
            orderId: ORDER_ID,
            purchasedCostCents: 1842,
          }
        },
      }),
    )

    const response = await POST(purchaseRequest(), context())
    assert.equal(response.status, 303)
    assert.equal(
      response.headers.get("location"),
      `/admin/pedidos/${ORDER_ID}?shipment=purchased`,
    )
    assert.deepEqual(inputs, [{
      shipmentId: SHIPMENT_ID,
      adminUserId: ADMIN_ID,
      expectedCostCents: 1842,
    }])
    assertPrivateNoStore(response)
  })
})

test("purchase rejects malformed confirmation price and malformed route id before service", async () => {
  await withPreviewEnv(async () => {
    const module = await loadModule()
    let calls = 0
    const POST = module.createAdminShipmentPurchaseActionHandler(
      purchaseDeps({
        purchaseShipment: async () => {
          calls += 1
          return { outcome: "purchased", shipmentId: SHIPMENT_ID, orderId: ORDER_ID }
        },
      }),
    )

    for (const fields of [
      { expectedCostCents: "" },
      { expectedCostCents: "0" },
      { expectedCostCents: "18.42" },
      { expectedCostCents: "999999999999999999999" },
    ]) {
      const response = await POST(purchaseRequest({ fields }), context())
      assert.equal(response.status, 400)
      assertPrivateNoStore(response)
    }

    const badId = await POST(purchaseRequest(), context("bad-id"))
    assert.equal(badId.status, 404)
    assert.equal(calls, 0)
  })
})

test("price-change redirect carries only trusted current cost for fresh confirmation", async () => {
  await withPreviewEnv(async () => {
    const module = await loadModule()
    const POST = module.createAdminShipmentPurchaseActionHandler(
      purchaseDeps({
        purchaseShipment: async () => ({
          outcome: "price_changed",
          shipmentId: SHIPMENT_ID,
          orderId: ORDER_ID,
          providerCostCents: 1990,
        }),
      }),
    )

    const response = await POST(
      purchaseRequest({ fields: { expectedCostCents: "1", providerCostCents: "1" } }),
      context(),
    )
    assert.equal(response.status, 303)
    assert.equal(
      response.headers.get("location"),
      `/admin/pedidos/${ORDER_ID}?shipment=price-changed&providerCostCents=1990`,
    )
    assertPrivateNoStore(response)
  })
})

test("purchase outcomes map to fixed safe feedback without provider ids or tax data", async () => {
  await withPreviewEnv(async () => {
    const module = await loadModule()
    const outcomes: Array<[PurchaseResult, number, string | null]> = [
      [{ outcome: "purchase_disabled" }, 303, "/admin/pedidos?shipment=purchase-disabled"],
      [{ outcome: "not_found" }, 404, null],
      [{ outcome: "invalid_state", shipmentId: SHIPMENT_ID, orderId: ORDER_ID }, 303, `/admin/pedidos/${ORDER_ID}?shipment=shipment-invalid`],
      [{ outcome: "busy", shipmentId: SHIPMENT_ID, orderId: ORDER_ID }, 303, `/admin/pedidos/${ORDER_ID}?shipment=shipment-busy`],
      [{ outcome: "provider_rejected", shipmentId: SHIPMENT_ID, orderId: ORDER_ID }, 303, `/admin/pedidos/${ORDER_ID}?shipment=provider-rejected`],
      [{ outcome: "reauthorization_required", shipmentId: SHIPMENT_ID, orderId: ORDER_ID }, 303, `/admin/pedidos/${ORDER_ID}?shipment=reauthorization-required`],
      [{ outcome: "attention_required", shipmentId: SHIPMENT_ID, orderId: ORDER_ID, reason: "purchase_outcome_unknown" }, 303, `/admin/pedidos/${ORDER_ID}?shipment=shipment-attention`],
    ]

    for (const [result, status, location] of outcomes) {
      const POST = module.createAdminShipmentPurchaseActionHandler(
        purchaseDeps({ purchaseShipment: async () => result }),
      )
      const response = await POST(purchaseRequest(), context())
      assert.equal(response.status, status, result.outcome)
      assert.equal(response.headers.get("location"), location, result.outcome)
      const serialized = `${response.headers.get("location") ?? ""}${await response.text()}`
      assert.ok(!serialized.includes("52998224725"))
      assert.ok(!serialized.includes("6e1c864a-fe48-4ae7-baaa-d6e4888bafd1"))
      assertPrivateNoStore(response)
    }
  })
})

test("reconciliation uses mutation rate limit and only trusted path/admin identity", async () => {
  await withPreviewEnv(async () => {
    const module = await loadModule()
    const calls: string[] = []
    const inputs: unknown[] = []
    const POST = module.createAdminShipmentReconcileActionHandler(
      reconcileDeps({
        consumeRateLimit: async () => {
          calls.push("rate")
          return true
        },
        authorizeAdmin: async () => {
          calls.push("auth")
          return principal()
        },
        reconcileShipment: async (input) => {
          calls.push("reconcile")
          inputs.push(input)
          return {
            outcome: "reconciled_not_purchased",
            shipmentId: SHIPMENT_ID,
            orderId: ORDER_ID,
          }
        },
      }),
    )

    const response = await POST(reconcileRequest(), context())
    assert.equal(response.status, 303)
    assert.equal(
      response.headers.get("location"),
      `/admin/pedidos/${ORDER_ID}?shipment=reconciled-not-purchased`,
    )
    assert.deepEqual(calls, ["rate", "auth", "reconcile"])
    assert.deepEqual(inputs, [{ shipmentId: SHIPMENT_ID, adminUserId: ADMIN_ID }])
    assertPrivateNoStore(response)
  })
})

test("purchase and reconciliation routes wire touched admin auth with distinct rate buckets", async () => {
  const purchaseRoute = new URL(
    "../app/api/internal/admin/shipments/[id]/purchase/route.ts",
    import.meta.url,
  )
  const reconcileRoute = new URL(
    "../app/api/internal/admin/shipments/[id]/reconcile/route.ts",
    import.meta.url,
  )
  const [purchase, reconcile] = await Promise.all([
    readFile(purchaseRoute, "utf8"),
    readFile(reconcileRoute, "utf8"),
  ])

  for (const text of [purchase, reconcile]) {
    assert.match(text, /runtime\s*=\s*["']nodejs["']/)
    assert.match(text, /authorizeAdminAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)
    assert.doesNotMatch(text, /addShipmentToMelhorEnvioCart|purchaseMelhorEnvioShipment|readMelhorEnvioShipment/)
  }
  assert.match(purchase, /createAdminShipmentPurchaseActionHandler/)
  assert.match(purchase, /admin-shipping-spend/)
  assert.match(purchase, /purchaseAdminShipment/)
  assert.match(reconcile, /createAdminShipmentReconcileActionHandler/)
  assert.match(reconcile, /admin-shipping-mutation/)
  assert.match(reconcile, /reconcileAdminShipmentPurchase/)
})
