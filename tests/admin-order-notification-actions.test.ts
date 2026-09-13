import assert from "node:assert/strict"
import test from "node:test"

type AdminResult =
  | { ok: true; principal: { userId: string } }
  | { ok: false; reason: "unauthenticated" | "not_admin" | "unavailable" }

const ORDER_ID = "11111111-1111-4111-8111-111111111111"
const NOTIFICATION_ID = "22222222-2222-4222-8222-222222222222"
const ADMIN_ID = "33333333-3333-4333-8333-333333333333"

async function loadAction() {
  return import("../lib/server/admin-order-notification-actions.ts")
}

function request(origin = "https://www.proxybembem.com.br") {
  return new Request(
    `https://www.proxybembem.com.br/api/internal/admin/orders/${ORDER_ID}/notifications/${NOTIFICATION_ID}/resend`,
    { method: "POST", headers: { origin } },
  )
}

function context(orderId = ORDER_ID, notificationId = NOTIFICATION_ID) {
  return { params: Promise.resolve({ id: orderId, notificationId }) }
}

test("resend action rejects cross-site requests before auth and mutation", async () => {
  const module = await loadAction()
  let authCalls = 0
  let resendCalls = 0
  const handler = module.createAdminOrderNotificationResendHandler({
    authorizeAdmin: async () => {
      authCalls += 1
      return { ok: true, principal: { userId: ADMIN_ID } } as AdminResult
    },
    resend: async () => {
      resendCalls += 1
      return { outcome: "created" as const, notificationId: NOTIFICATION_ID }
    },
  })

  const previousSite = process.env.NEXT_PUBLIC_SITE_URL
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.proxybembem.com.br"
  try {
    const response = await handler(request("https://evil.example"), context())
    assert.equal(response.status, 403)
    assert.equal(response.headers.get("cache-control"), "private, no-store")
    assert.equal(authCalls, 0)
    assert.equal(resendCalls, 0)
  } finally {
    if (previousSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = previousSite
  }
})

test("resend action requires successful owner/AAL2 admin authorization", async () => {
  const module = await loadAction()
  const previousSite = process.env.NEXT_PUBLIC_SITE_URL
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.proxybembem.com.br"
  try {
    for (const [admin, expected] of [
      [{ ok: false, reason: "unauthenticated" } as const, 401],
      [{ ok: false, reason: "not_admin" } as const, 403],
      [{ ok: false, reason: "unavailable" } as const, 503],
    ] as const) {
      let resendCalls = 0
      const handler = module.createAdminOrderNotificationResendHandler({
        authorizeAdmin: async () => admin,
        resend: async () => {
          resendCalls += 1
          return { outcome: "created" as const, notificationId: NOTIFICATION_ID }
        },
      })
      const response = await handler(request(), context())
      assert.equal(response.status, expected)
      assert.equal(resendCalls, 0)
    }
  } finally {
    if (previousSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = previousSite
  }
})

test("resend action validates both UUIDs before calling the RPC", async () => {
  const module = await loadAction()
  let calls = 0
  const previousSite = process.env.NEXT_PUBLIC_SITE_URL
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.proxybembem.com.br"
  try {
    const handler = module.createAdminOrderNotificationResendHandler({
      authorizeAdmin: async () => ({ ok: true, principal: { userId: ADMIN_ID } }),
      resend: async () => {
        calls += 1
        return { outcome: "created" as const, notificationId: NOTIFICATION_ID }
      },
    })
    assert.equal((await handler(request(), context("bad", NOTIFICATION_ID))).status, 404)
    assert.equal((await handler(request(), context(ORDER_ID, "bad"))).status, 404)
    assert.equal(calls, 0)
  } finally {
    if (previousSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = previousSite
  }
})

test("resend action passes authenticated admin id and redirects with bounded feedback", async () => {
  const module = await loadAction()
  const previousSite = process.env.NEXT_PUBLIC_SITE_URL
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.proxybembem.com.br"
  try {
    const seen: unknown[] = []
    for (const [outcome, feedback] of [
      ["created", "resent"],
      ["conflict", "resend-conflict"],
      ["not_ready", "resend-not-ready"],
    ] as const) {
      const handler = module.createAdminOrderNotificationResendHandler({
        authorizeAdmin: async () => ({ ok: true, principal: { userId: ADMIN_ID } }),
        resend: async (input) => {
          seen.push(input)
          return { outcome, notificationId: NOTIFICATION_ID }
        },
      })
      const response = await handler(request(), context())
      assert.equal(response.status, 303)
      assert.equal(
        response.headers.get("location"),
        `/admin/pedidos/${ORDER_ID}?notification=${feedback}`,
      )
      assert.equal(response.headers.get("cache-control"), "private, no-store")
    }
    assert.deepEqual(seen, Array(3).fill({
      orderId: ORDER_ID,
      notificationId: NOTIFICATION_ID,
      adminUserId: ADMIN_ID,
    }))
  } finally {
    if (previousSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = previousSite
  }
})

test("not-found and storage errors stay sanitized", async () => {
  const module = await loadAction()
  const previousSite = process.env.NEXT_PUBLIC_SITE_URL
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.proxybembem.com.br"
  try {
    const notFoundHandler = module.createAdminOrderNotificationResendHandler({
      authorizeAdmin: async () => ({ ok: true, principal: { userId: ADMIN_ID } }),
      resend: async () => ({ outcome: "not_found" as const, notificationId: null }),
    })
    assert.equal((await notFoundHandler(request(), context())).status, 404)

    const failureHandler = module.createAdminOrderNotificationResendHandler({
      authorizeAdmin: async () => ({ ok: true, principal: { userId: ADMIN_ID } }),
      resend: async () => {
        throw new Error("sensitive-provider-body")
      },
    })
    const response = await failureHandler(request(), context())
    assert.equal(response.status, 503)
    assert.doesNotMatch(await response.text(), /sensitive-provider-body/)
  } finally {
    if (previousSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = previousSite
  }
})
