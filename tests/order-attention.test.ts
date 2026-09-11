import assert from "node:assert/strict"
import test from "node:test"
import {
  listOpenOrderAttention,
  openOrderAttention,
  resolveOrderAttention,
} from "../lib/server/order-attention.ts"

const ORDER_ID = "550e8400-e29b-41d4-a716-446655440000"
const FLAG_ID = "661f9511-f3ac-42e5-b827-557766551111"
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

function attentionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: FLAG_ID,
    order_id: ORDER_ID,
    code: "address_issue",
    severity: "warning",
    source: "admin",
    metadata: { reason: "invalid_number" },
    opened_at: "2026-09-02T04:00:00.000Z",
    resolved_at: null,
    ...overrides,
  }
}

test("opens attention with an ordinary insert and no fake upsert target", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        assert.equal(url.pathname, "/rest/v1/order_attention_flags")
        assert.equal(url.searchParams.has("on_conflict"), false)
        assert.equal(init?.method, "POST")
        assert.equal(new Headers(init?.headers).get("prefer"), "return=representation")
        assert.deepEqual(JSON.parse(String(init?.body)), {
          order_id: ORDER_ID,
          code: "address_issue",
          severity: "warning",
          source: "admin",
          metadata: { reason: "invalid_number" },
        })
        return new Response(JSON.stringify([attentionRow()]), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        })
      },
    )

    const result = await openOrderAttention({
      orderId: ORDER_ID,
      code: "address_issue",
      severity: "warning",
      source: "admin",
      metadata: { reason: "invalid_number" },
    })
    assert.equal(result?.code, "address_issue")
  })
})

test("treats only the named active partial-index duplicate as idempotent", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            code: "23505",
            message:
              'duplicate key value violates unique constraint "order_attention_active_code_uidx"',
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
    )

    assert.equal(
      await openOrderAttention({
        orderId: ORDER_ID,
        code: "address_issue",
        severity: "warning",
        source: "admin",
      }),
      null,
    )
  })
})

test("does not swallow unrelated storage conflicts", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ code: "23505", message: "some_other_constraint" }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
    )

    await assert.rejects(() =>
      openOrderAttention({
        orderId: ORDER_ID,
        code: "address_issue",
        severity: "warning",
        source: "admin",
      }),
    )
  })
})

test("resolves only the active matching attention row", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        assert.equal(url.pathname, "/rest/v1/order_attention_flags")
        assert.equal(url.searchParams.get("order_id"), `eq.${ORDER_ID}`)
        assert.equal(url.searchParams.get("code"), "eq.address_issue")
        assert.equal(url.searchParams.get("resolved_at"), "is.null")
        assert.equal(init?.method, "PATCH")
        assert.equal(new Headers(init?.headers).get("prefer"), "return=representation")
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        assert.deepEqual(Object.keys(body), ["resolved_at"])
        assert.equal(typeof body.resolved_at, "string")
        assert.equal(Number.isNaN(Date.parse(String(body.resolved_at))), false)
        return new Response(
          JSON.stringify([
            attentionRow({ resolved_at: body.resolved_at }),
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      },
    )

    const result = await resolveOrderAttention({
      orderId: ORDER_ID,
      code: "address_issue",
    })
    assert.equal(result?.code, "address_issue")
    assert.notEqual(result?.resolved_at, null)
  })
})

test("lists only open attention newest first", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input))
      assert.equal(url.searchParams.get("order_id"), `eq.${ORDER_ID}`)
      assert.equal(url.searchParams.get("resolved_at"), "is.null")
      assert.equal(url.searchParams.get("order"), "opened_at.desc")
      return new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    })

    assert.deepEqual(await listOpenOrderAttention(ORDER_ID), [])
  })
})

test("rejects invalid attention input before fetch", async (t) => {
  await withSupabaseEnv(async () => {
    let calls = 0
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1
      return new Response("[]", { status: 200 })
    })

    await assert.rejects(() =>
      openOrderAttention({
        orderId: "bad",
        code: "address_issue",
        severity: "warning",
        source: "admin",
      }),
    )
    await assert.rejects(() =>
      openOrderAttention({
        orderId: ORDER_ID,
        code: "Bad Code",
        severity: "warning",
        source: "admin",
      }),
    )
    await assert.rejects(() =>
      openOrderAttention({
        orderId: ORDER_ID,
        code: "address_issue",
        severity: "urgent" as never,
        source: "admin",
      }),
    )
    await assert.rejects(() =>
      openOrderAttention({
        orderId: ORDER_ID,
        code: "address_issue",
        severity: "warning",
        source: "other" as never,
      }),
    )
    await assert.rejects(() =>
      openOrderAttention({
        orderId: ORDER_ID,
        code: "address_issue",
        severity: "warning",
        source: "admin",
        metadata: { nested: { refresh_token: "no" } },
      }),
    )
    await assert.rejects(() =>
      resolveOrderAttention({ orderId: ORDER_ID, code: "Bad Code" }),
    )
    assert.equal(calls, 0)
  })
})
