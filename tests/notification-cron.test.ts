import assert from "node:assert/strict"
import test from "node:test"

const CRON_VALUE = "test-cron-value-123456789012345678901234567890"

async function withEnv<T>(fn: () => Promise<T>) {
  const names = ["CRON_SECRET", "SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  process.env.CRON_SECRET = CRON_VALUE
  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "test-service-role-value"
  try {
    return await fn()
  } finally {
    for (const name of names) {
      const value = previous[name]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

function request(headers?: HeadersInit) {
  return new Request("https://www.proxybembem.com.br/api/internal/notifications/process", {
    method: "POST",
    headers,
  })
}

test("notification cron rejects missing malformed and wrong credentials before database access", async (t) => {
  await withEnv(async () => {
    const { POST } = await import("../app/api/internal/notifications/process/route.ts")
    let fetchCalls = 0
    t.mock.method(globalThis, "fetch", async () => {
      fetchCalls += 1
      return Response.json([])
    })
    const variants: HeadersInit[] = [
      {},
      { authorization: "" },
      { authorization: CRON_VALUE },
      { authorization: `Basic ${CRON_VALUE}` },
      { authorization: "Bearer wrong-value" },
      { authorization: `bearer ${CRON_VALUE}` },
      { authorization: `Bearer ${CRON_VALUE} extra` },
      { "x-cron-auth": "wrong-value" },
    ]

    for (const headers of variants) {
      const response = await POST(request(headers))
      assert.equal(response.status, 401)
      assert.equal(response.headers.get("cache-control"), "no-store")
      assert.deepEqual(await response.json(), { ok: false })
    }
    assert.equal(fetchCalls, 0)
  })
})

test("notification cron accepts Bearer and KingHost X-CRON-AUTH and returns only bounded counts", async (t) => {
  await withEnv(async () => {
    const { POST } = await import("../app/api/internal/notifications/process/route.ts")
    const bodies: Record<string, unknown>[] = []
    t.mock.method(globalThis, "fetch", async (input, init) => {
      const url = new URL(String(input))
      assert.equal(url.pathname, "/rest/v1/rpc/claim_due_notification_outbox")
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      bodies.push(body)
      assert.equal(body.p_limit, 25)
      assert.equal(body.p_lease_seconds, 120)
      assert.match(String(body.p_worker_id), /^[0-9a-f-]{36}$/i)
      return Response.json([])
    })

    for (const headers of [
      { authorization: `Bearer ${CRON_VALUE}` },
      { "x-cron-auth": CRON_VALUE },
    ]) {
      const response = await POST(request(headers))
      assert.equal(response.status, 200)
      assert.equal(response.headers.get("cache-control"), "no-store")
      const json = await response.json()
      assert.deepEqual(json, {
        ok: true,
        claimed: 0,
        accepted: 0,
        retryScheduled: 0,
        failed: 0,
      })
      assert.doesNotMatch(JSON.stringify(json), /@|recipient|email|provider|body|subject/i)
    }
    assert.equal(bodies.length, 2)
  })
})

test("notification cron sanitizes worker or database failures", async (t) => {
  await withEnv(async () => {
    const { POST } = await import("../app/api/internal/notifications/process/route.ts")
    t.mock.method(globalThis, "fetch", async () => {
      throw new Error("sensitive-provider-detail")
    })

    const response = await POST(request({ authorization: `Bearer ${CRON_VALUE}` }))
    assert.equal(response.status, 503)
    assert.equal(response.headers.get("cache-control"), "no-store")
    const text = await response.text()
    assert.equal(text, JSON.stringify({ ok: false }))
    assert.doesNotMatch(text, /sensitive-provider-detail|@/i)
  })
})
