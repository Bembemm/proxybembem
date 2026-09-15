import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { NextRequest } from "next/server.js"
import { createAdminOrderActionHandler } from "../lib/server/admin-order-actions.ts"

const ORDER_ID = "11111111-1111-4111-8111-111111111111"
const ADMIN_ID = "22222222-2222-4222-8222-222222222222"
const AUTH_SESSION_ID = "33333333-3333-4333-8333-333333333333"
const ENV_KEYS = ["NEXT_PUBLIC_SITE_URL"] as const

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

function request(input?: { origin?: string; body?: string }) {
  return new NextRequest(
    `https://preview.example/api/internal/admin/orders/${ORDER_ID}/start-production`,
    {
      method: "POST",
      headers: {
        origin: input?.origin ?? "https://preview.example",
        ...(input?.body ? { "content-type": "application/json" } : {}),
      },
      body: input?.body,
    },
  )
}

function context(id = ORDER_ID) {
  return { params: Promise.resolve({ id }) }
}

function allowedPrincipal() {
  return {
    ok: true as const,
    principal: {
      userId: ADMIN_ID,
      authSessionId: AUTH_SESSION_ID,
      aal: "aal2" as const,
    },
  }
}

function transitionResult(overrides: Record<string, unknown> = {}) {
  return {
    outcome: "transitioned" as const,
    order_id: ORDER_ID,
    order_number: "PB-A1B2C3D4E5F6",
    payment_status: "approved",
    previous_fulfillment_status: "awaiting_production" as const,
    fulfillment_status: "in_production" as const,
    ...overrides,
  }
}

function assertPrivateNoStore(response: Response) {
  assert.match(response.headers.get("cache-control") ?? "", /private/i)
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i)
}

test("rejects cross-site Origin before admin authorization or storage", async () => {
  await withPreviewEnv(async () => {
    const calls: string[] = []
    const POST = createAdminOrderActionHandler({
      targetStatus: "in_production",
      authorizeAdmin: async () => {
        calls.push("auth")
        return allowedPrincipal()
      },
      transitionOrder: async () => {
        calls.push("transition")
        return transitionResult()
      },
    })

    const response = await POST(
      request({ origin: "https://evil.example" }),
      context(),
    )
    assert.equal(response.status, 403)
    assert.deepEqual(calls, [])
    assertPrivateNoStore(response)
  })
})

test("requires active AAL2 admin and maps auth failures without touching storage", async () => {
  await withPreviewEnv(async () => {
    for (const [reason, expectedStatus] of [
      ["unauthenticated", 401],
      ["mfa_required", 401],
      ["invalid_session", 401],
      ["session_missing", 401],
      ["session_revoked", 401],
      ["session_expired", 401],
      ["fresh_login_required", 401],
      ["session_reused", 401],
      ["not_admin", 403],
      ["unavailable", 503],
    ] as const) {
      let transitionCalls = 0
      const POST = createAdminOrderActionHandler({
        targetStatus: "canceled",
        authorizeAdmin: async () => ({ ok: false as const, reason }),
        transitionOrder: async () => {
          transitionCalls += 1
          return transitionResult()
        },
      })

      const response = await POST(request(), context())
      assert.equal(response.status, expectedStatus, reason)
      assert.equal(transitionCalls, 0, reason)
      assert.equal(await response.text(), "", reason)
      assertPrivateNoStore(response)
    }
  })
})

test("awaits and validates route params after auth and rejects malformed order IDs", async () => {
  await withPreviewEnv(async () => {
    const calls: string[] = []
    const POST = createAdminOrderActionHandler({
      targetStatus: "canceled",
      authorizeAdmin: async () => {
        calls.push("auth")
        return allowedPrincipal()
      },
      transitionOrder: async () => {
        calls.push("transition")
        return transitionResult()
      },
    })

    const response = await POST(request(), context("not-a-uuid"))
    assert.equal(response.status, 404)
    assert.deepEqual(calls, ["auth"])
    assertPrivateNoStore(response)
  })
})

test("uses authenticated principal and server-wired target even if request body tries to override both", async () => {
  await withPreviewEnv(async () => {
    const calls: unknown[] = []
    const POST = createAdminOrderActionHandler({
      targetStatus: "in_production",
      authorizeAdmin: async () => allowedPrincipal(),
      transitionOrder: async (input) => {
        calls.push(input)
        return transitionResult()
      },
    })

    const response = await POST(
      request({
        body: JSON.stringify({
          targetStatus: "canceled",
          adminUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          payment_status: "refunded",
        }),
      }),
      context(),
    )

    assert.deepEqual(calls, [
      {
        orderId: ORDER_ID,
        adminUserId: ADMIN_ID,
        targetStatus: "in_production",
      },
    ])
    assert.equal(response.status, 303)
    assert.equal(
      response.headers.get("location"),
      `/admin/pedidos/${ORDER_ID}?status=updated`,
    )
    assertPrivateNoStore(response)
  })
})

test("maps fulfillment outcomes to one fixed HTML-form response policy", async () => {
  await withPreviewEnv(async () => {
    const cases = [
      ["transitioned", 303, "updated"],
      ["unchanged", 303, "unchanged"],
      ["invalid_transition", 303, "invalid-transition"],
      ["payment_precondition_failed", 303, "payment-required"],
      ["not_found", 404, null],
    ] as const

    for (const [outcome, status, feedback] of cases) {
      const POST = createAdminOrderActionHandler({
        targetStatus: "in_production",
        authorizeAdmin: async () => allowedPrincipal(),
        transitionOrder: async () =>
          outcome === "not_found"
            ? {
                outcome,
                order_id: null,
                order_number: null,
                payment_status: null,
                previous_fulfillment_status: null,
                fulfillment_status: null,
              }
            : transitionResult({ outcome }),
      })

      const response = await POST(request(), context())
      assert.equal(response.status, status, outcome)
      if (feedback) {
        assert.equal(
          response.headers.get("location"),
          `/admin/pedidos/${ORDER_ID}?status=${feedback}`,
          outcome,
        )
      } else {
        assert.equal(response.headers.get("location"), null, outcome)
      }
      assertPrivateNoStore(response)
    }
  })
})

test("maps thrown auth or storage failures to sanitized 503 responses", async () => {
  await withPreviewEnv(async () => {
    const authFailure = createAdminOrderActionHandler({
      targetStatus: "canceled",
      authorizeAdmin: async () => {
        throw new Error("secret auth detail")
      },
      transitionOrder: async () => transitionResult(),
    })
    const authResponse = await authFailure(request(), context())
    assert.equal(authResponse.status, 503)
    assert.equal(await authResponse.text(), "")
    assertPrivateNoStore(authResponse)

    const storageFailure = createAdminOrderActionHandler({
      targetStatus: "canceled",
      authorizeAdmin: async () => allowedPrincipal(),
      transitionOrder: async () => {
        throw new Error("secret storage detail")
      },
    })
    const storageResponse = await storageFailure(request(), context())
    assert.equal(storageResponse.status, 503)
    assert.equal(await storageResponse.text(), "")
    assertPrivateNoStore(storageResponse)
  })
})

test("five route modules wire fixed targets and export no handler factory", async () => {
  const routes = [
    ["start-production", "in_production"],
    ["mark-ready-to-ship", "ready_to_ship"],
    ["mark-shipped", "shipped"],
    ["mark-completed", "completed"],
    ["cancel", "canceled"],
  ] as const

  for (const [route, target] of routes) {
    const source = await readFile(
      new URL(
        `../app/api/internal/admin/orders/[id]/${route}/route.ts`,
        import.meta.url,
      ),
      "utf8",
    )

    assert.match(source, /export\s+const\s+runtime\s*=\s*["']nodejs["']/)
    assert.match(source, /export\s+const\s+POST\s*=\s*createAdminOrderActionHandler/)
    assert.match(source, /authorizeAdminAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)
    assert.match(source, new RegExp(`targetStatus:\\s*["']${target}["']`))
    assert.doesNotMatch(source, /export\s+(?:function|const)\s+createAdminOrderActionHandler/)
    assert.doesNotMatch(source, /payment_status|payment_id|payment_status_detail/)
  }
})
