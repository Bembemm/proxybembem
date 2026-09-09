import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { NextRequest } from "next/server.js"

const ORDER_ID = "11111111-1111-4111-8111-111111111111"
const ADMIN_ID = "22222222-2222-4222-8222-222222222222"
const AUTH_SESSION_ID = "33333333-3333-4333-8333-333333333333"
const SHIPMENT_ID = "44444444-4444-4444-8444-444444444444"
const ENV_KEYS = ["NEXT_PUBLIC_SITE_URL"] as const

interface AdminAccessResultOk {
  ok: true
  principal: { userId: string; authSessionId: string; aal: "aal2" }
}
type AdminAccessResult = AdminAccessResultOk | { ok: false; reason: string }

type PrepareResult = {
  outcome: string
  shipmentId?: string
  providerCostCents?: number
  reason?: string
}

interface ActionDependencies {
  authorizeAdmin(): Promise<AdminAccessResult>
  consumeRateLimit(request: NextRequest): Promise<boolean>
  prepareShipment(input: { orderId: string; adminUserId: string }): Promise<PrepareResult>
}

type HandlerContext = { params: Promise<{ id: string }> }

type ActionModule = {
  createAdminShipmentPrepareActionHandler(
    deps: ActionDependencies,
  ): (request: NextRequest, context: HandlerContext) => Promise<Response>
}

async function loadAction(): Promise<ActionModule> {
  const path = "../lib/server/admin-shipment-actions.ts"
  return (await import(path)) as ActionModule
}

function allowedPrincipal(): AdminAccessResultOk {
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

function request(input: { origin?: string; body?: URLSearchParams } = {}) {
  return new NextRequest(
    `https://preview.example/api/internal/admin/orders/${ORDER_ID}/shipment/prepare`,
    {
      method: "POST",
      headers: {
        origin: input.origin ?? "https://preview.example",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: input.body ?? new URLSearchParams(),
    },
  )
}

function context(id = ORDER_ID): HandlerContext {
  return { params: Promise.resolve({ id }) }
}

function baseDeps(overrides: Partial<ActionDependencies> = {}): ActionDependencies {
  return {
    authorizeAdmin: async () => allowedPrincipal(),
    consumeRateLimit: async () => true,
    prepareShipment: async () => ({
      outcome: "prepared",
      shipmentId: SHIPMENT_ID,
      providerCostCents: 1842,
    }),
    ...overrides,
  }
}

function assertPrivateNoStore(response: Response) {
  assert.match(response.headers.get("cache-control") ?? "", /private/i)
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i)
  assert.equal(response.headers.get("pragma"), "no-cache")
}

test("rejects cross-site shipment mutation before rate limit, auth or provider orchestration", async () => {
  await withPreviewEnv(async () => {
    const module = await loadAction()
    const calls: string[] = []
    const POST = module.createAdminShipmentPrepareActionHandler(
      baseDeps({
        consumeRateLimit: async () => {
          calls.push("rate")
          return true
        },
        authorizeAdmin: async () => {
          calls.push("auth")
          return allowedPrincipal()
        },
        prepareShipment: async () => {
          calls.push("prepare")
          return { outcome: "prepared", shipmentId: SHIPMENT_ID }
        },
      }),
    )

    const response = await POST(request({ origin: "https://evil.example" }), context())
    assert.equal(response.status, 403)
    assert.deepEqual(calls, [])
    assertPrivateNoStore(response)
  })
})

test("uses admin-shipping-mutation rate limiting before admin authorization", async () => {
  await withPreviewEnv(async () => {
    const module = await loadAction()
    const calls: string[] = []
    const POST = module.createAdminShipmentPrepareActionHandler(
      baseDeps({
        consumeRateLimit: async () => {
          calls.push("rate")
          return false
        },
        authorizeAdmin: async () => {
          calls.push("auth")
          return allowedPrincipal()
        },
      }),
    )

    const response = await POST(request(), context())
    assert.equal(response.status, 429)
    assert.equal(response.headers.get("retry-after"), "300")
    assert.deepEqual(calls, ["rate"])
    assertPrivateNoStore(response)
  })
})

test("requires active AAL2 admin before preparing a shipment", async () => {
  await withPreviewEnv(async () => {
    const module = await loadAction()
    for (const [reason, status] of [
      ["unauthenticated", 401],
      ["mfa_required", 401],
      ["not_admin", 403],
      ["unavailable", 503],
    ] as const) {
      let prepares = 0
      const POST = module.createAdminShipmentPrepareActionHandler(
        baseDeps({
          authorizeAdmin: async () => ({ ok: false as const, reason }),
          prepareShipment: async () => {
            prepares += 1
            return { outcome: "prepared", shipmentId: SHIPMENT_ID }
          },
        }),
      )
      const response = await POST(request(), context())
      assert.equal(response.status, status, reason)
      assert.equal(prepares, 0, reason)
      assertPrivateNoStore(response)
    }
  })
})

test("passes only trusted path order id plus authenticated admin id and ignores browser shipment values", async () => {
  await withPreviewEnv(async () => {
    const module = await loadAction()
    const inputs: Array<{ orderId: string; adminUserId: string }> = []
    const POST = module.createAdminShipmentPrepareActionHandler(
      baseDeps({
        prepareShipment: async (input) => {
          inputs.push(input)
          return {
            outcome: "prepared",
            shipmentId: SHIPMENT_ID,
            providerCostCents: 1842,
          }
        },
      }),
    )

    const malicious = new URLSearchParams({
      serviceId: "999",
      customerShippingCents: "1",
      quantity: "999",
      unitValueCents: "1",
      documentMode: "invoice",
      invoiceKey: "123",
      environment: "sandbox",
      adminUserId: "browser-controlled",
    })
    const response = await POST(request({ body: malicious }), context())

    assert.equal(response.status, 303)
    assert.equal(
      response.headers.get("location"),
      `/admin/pedidos/${ORDER_ID}?shipment=prepared`,
    )
    assert.deepEqual(inputs, [{ orderId: ORDER_ID, adminUserId: ADMIN_ID }])
    assertPrivateNoStore(response)
    assert.equal(await response.text(), "")
  })
})

test("rejects malformed route ids before preparation", async () => {
  await withPreviewEnv(async () => {
    const module = await loadAction()
    let prepares = 0
    const POST = module.createAdminShipmentPrepareActionHandler(
      baseDeps({
        prepareShipment: async () => {
          prepares += 1
          return { outcome: "prepared", shipmentId: SHIPMENT_ID }
        },
      }),
    )

    const response = await POST(request(), context("bad-id"))
    assert.equal(response.status, 404)
    assert.equal(prepares, 0)
    assertPrivateNoStore(response)
  })
})

test("maps preparation outcomes to safe admin feedback without leaking provider or tax details", async () => {
  await withPreviewEnv(async () => {
    const module = await loadAction()
    const outcomes: Array<[PrepareResult, number, string | null]> = [
      [{ outcome: "not_found" }, 404, null],
      [{ outcome: "missing_sender" }, 303, "sender-missing"],
      [{ outcome: "invalid_snapshot", reason: "multiple_packages_not_supported" }, 303, "shipment-invalid"],
      [{ outcome: "busy", shipmentId: SHIPMENT_ID }, 303, "shipment-busy"],
      [{ outcome: "provider_rejected", shipmentId: SHIPMENT_ID }, 303, "provider-rejected"],
      [{ outcome: "reauthorization_required", shipmentId: SHIPMENT_ID }, 303, "reauthorization-required"],
      [{ outcome: "attention_required", shipmentId: SHIPMENT_ID, reason: "cart_outcome_unknown" }, 303, "shipment-attention"],
    ]

    for (const [result, status, feedback] of outcomes) {
      const POST = module.createAdminShipmentPrepareActionHandler(
        baseDeps({ prepareShipment: async () => result }),
      )
      const response = await POST(request(), context())
      assert.equal(response.status, status, result.outcome)
      if (feedback) {
        assert.equal(
          response.headers.get("location"),
          `/admin/pedidos/${ORDER_ID}?shipment=${feedback}`,
          result.outcome,
        )
      }
      const serialized = `${response.headers.get("location") ?? ""}${await response.text()}`
      assert.ok(!serialized.includes("52998224725"))
      assert.ok(!serialized.includes("provider" + "-secret"))
      assertPrivateNoStore(response)
    }
  })
})

test("route wires AAL2 admin auth, mutation rate limit and server preparation only", async () => {
  const route = new URL(
    "../app/api/internal/admin/orders/[id]/shipment/prepare/route.ts",
    import.meta.url,
  )
  const text = await readFile(route, "utf8")

  assert.match(text, /runtime\s*=\s*["']nodejs["']/)
  assert.match(text, /createAdminShipmentPrepareActionHandler/)
  assert.match(text, /authorizeAdminAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)
  assert.match(text, /consumeRateLimit/)
  assert.match(text, /admin-shipping-mutation/)
  assert.match(text, /prepareAdminShipment/)
  assert.doesNotMatch(text, /shipping-checkout|purchaseMelhorEnvioShipment|labelPurchaseEnabled/)
})
