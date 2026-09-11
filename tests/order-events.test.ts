import assert from "node:assert/strict"
import test from "node:test"
import {
  appendOrderEvent,
  listOrderEvents,
} from "../lib/server/order-events.ts"

const ORDER_ID = "550e8400-e29b-41d4-a716-446655440000"
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

test("deduped append targets dedupe_key conflict explicitly", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        assert.equal(url.pathname, "/rest/v1/order_events")
        assert.equal(url.searchParams.get("on_conflict"), "dedupe_key")
        assert.equal(
          url.searchParams.get("select"),
          "id,order_id,event_type,source,dedupe_key,metadata,created_at",
        )
        assert.equal(init?.method, "POST")
        assert.equal(
          new Headers(init?.headers).get("prefer"),
          "resolution=ignore-duplicates,return=representation",
        )
        assert.deepEqual(JSON.parse(String(init?.body)), {
          order_id: ORDER_ID,
          event_type: "production_started",
          source: "admin",
          dedupe_key: "production-start:1",
          metadata: { reason: "admin_action" },
        })
        return new Response("[]", {
          status: 201,
          headers: { "Content-Type": "application/json" },
        })
      },
    )

    assert.equal(
      await appendOrderEvent({
        orderId: ORDER_ID,
        eventType: "production_started",
        source: "admin",
        dedupeKey: "production-start:1",
        metadata: { reason: "admin_action" },
      }),
      null,
    )
  })
})

test("ordinary append does not use a conflict target", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        assert.equal(url.searchParams.has("on_conflict"), false)
        assert.equal(new Headers(init?.headers).get("prefer"), "return=representation")
        return new Response(
          JSON.stringify([
            {
              id: ORDER_ID,
              order_id: ORDER_ID,
              event_type: "production_started",
              source: "admin",
              dedupe_key: null,
              metadata: {},
              created_at: "2026-09-02T00:00:00Z",
            },
          ]),
          { status: 201, headers: { "Content-Type": "application/json" } },
        )
      },
    )

    const result = await appendOrderEvent({
      orderId: ORDER_ID,
      eventType: "production_started",
      source: "admin",
    })
    assert.equal(result?.event_type, "production_started")
  })
})

test("lists newest events with a bounded server query", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input))
      assert.equal(url.searchParams.get("order_id"), `eq.${ORDER_ID}`)
      assert.equal(url.searchParams.get("order"), "created_at.desc")
      assert.equal(url.searchParams.get("limit"), "25")
      return new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    })

    assert.deepEqual(await listOrderEvents(ORDER_ID, 25), [])
  })
})

test("rejects malformed inputs before fetch", async (t) => {
  await withSupabaseEnv(async () => {
    let calls = 0
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1
      return new Response("[]", { status: 200 })
    })

    await assert.rejects(() =>
      appendOrderEvent({
        orderId: "bad",
        eventType: "production_started",
        source: "admin",
      }),
    )
    await assert.rejects(() =>
      appendOrderEvent({
        orderId: ORDER_ID,
        eventType: "Bad Event",
        source: "admin",
      }),
    )
    await assert.rejects(() =>
      appendOrderEvent({
        orderId: ORDER_ID,
        eventType: "production_started",
        source: "other" as never,
      }),
    )
    await assert.rejects(() =>
      appendOrderEvent({
        orderId: ORDER_ID,
        eventType: "production_started",
        source: "admin",
        dedupeKey: "x".repeat(201),
      }),
    )
    await assert.rejects(() =>
      appendOrderEvent({
        orderId: ORDER_ID,
        eventType: "production_started",
        source: "admin",
        metadata: { nested: { access_token: "no" } },
      }),
    )
    await assert.rejects(() => listOrderEvents(ORDER_ID, 0))
    assert.equal(calls, 0)
  })
})
