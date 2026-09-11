import assert from "node:assert/strict"
import test from "node:test"
import { transitionAdminOrderFulfillment } from "../lib/server/admin-order-operations.ts"

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const
const ORDER_ID = "11111111-1111-4111-8111-111111111111"
const ADMIN_ID = "22222222-2222-4222-8222-222222222222"

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

function result(overrides: Record<string, unknown> = {}) {
  return {
    outcome: "transitioned",
    order_id: ORDER_ID,
    order_number: "PB-A1B2C3D4E5F6",
    payment_status: "approved",
    previous_fulfillment_status: "awaiting_production",
    fulfillment_status: "in_production",
    ...overrides,
  }
}

test("calls only the atomic fulfillment RPC with exact trusted arguments", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        assert.equal(
          String(input),
          "https://example.supabase.co/rest/v1/rpc/admin_transition_order_fulfillment",
        )
        assert.equal(init?.method, "POST")
        assert.equal((init?.headers as Record<string, string>)?.apikey, "server-secret")
        assert.equal(init?.cache, "no-store")
        assert.deepEqual(JSON.parse(String(init?.body)), {
          p_order_id: ORDER_ID,
          p_admin_user_id: ADMIN_ID,
          p_target_status: "in_production",
        })

        return new Response(JSON.stringify(result()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      },
    )

    assert.deepEqual(
      await transitionAdminOrderFulfillment({
        orderId: ORDER_ID,
        adminUserId: ADMIN_ID,
        targetStatus: "in_production",
      }),
      result(),
    )
  })
})

test("accepts exactly the five admin fulfillment targets", async (t) => {
  await withSupabaseEnv(async () => {
    const targets = [
      "in_production",
      "ready_to_ship",
      "shipped",
      "completed",
      "canceled",
    ] as const

    let calls = 0
    t.mock.method(
      globalThis,
      "fetch",
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const body = JSON.parse(String(init?.body)) as { p_target_status: string }
        assert.equal(body.p_target_status, targets[calls])
        const target = targets[calls++]
        return new Response(
          JSON.stringify(
            result({
              previous_fulfillment_status:
                target === "in_production" ? "awaiting_production" : "in_production",
              fulfillment_status: target,
            }),
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      },
    )

    for (const targetStatus of targets) {
      const response = await transitionAdminOrderFulfillment({
        orderId: ORDER_ID,
        adminUserId: ADMIN_ID,
        targetStatus,
      })
      assert.equal(response.fulfillment_status, targetStatus)
    }
    assert.equal(calls, targets.length)
  })
})

test("rejects malformed IDs and non-admin targets before fetch", async (t) => {
  let calls = 0
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1
    return new Response("{}", { status: 200 })
  })

  const invalid = [
    { orderId: "not-a-uuid", adminUserId: ADMIN_ID, targetStatus: "canceled" },
    { orderId: ORDER_ID, adminUserId: "not-a-uuid", targetStatus: "canceled" },
    { orderId: ORDER_ID, adminUserId: ADMIN_ID, targetStatus: "awaiting_payment" },
    { orderId: ORDER_ID, adminUserId: ADMIN_ID, targetStatus: "awaiting_production" },
    { orderId: ORDER_ID, adminUserId: ADMIN_ID, targetStatus: "invented" },
  ]

  for (const input of invalid) {
    await assert.rejects(() => transitionAdminOrderFulfillment(input as never))
  }
  assert.equal(calls, 0)
})

test("strictly accepts documented outcomes and future provider payment status display values", async (t) => {
  await withSupabaseEnv(async () => {
    const payloads = [
      result({ outcome: "transitioned", payment_status: "future_provider_status_2" }),
      result({ outcome: "unchanged" }),
      result({ outcome: "invalid_transition" }),
      result({ outcome: "payment_precondition_failed" }),
      {
        outcome: "not_found",
        order_id: null,
        order_number: null,
        payment_status: null,
        previous_fulfillment_status: null,
        fulfillment_status: null,
      },
    ]

    let index = 0
    t.mock.method(globalThis, "fetch", async () => {
      return new Response(JSON.stringify(payloads[index++]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    })

    for (const expected of payloads) {
      assert.deepEqual(
        await transitionAdminOrderFulfillment({
          orderId: ORDER_ID,
          adminUserId: ADMIN_ID,
          targetStatus: "in_production",
        }),
        expected,
      )
    }
  })
})

test("rejects malformed RPC responses rather than coercing them", async (t) => {
  await withSupabaseEnv(async () => {
    const payloads: unknown[] = [
      [],
      {},
      result({ outcome: "made_up" }),
      result({ order_id: "bad-id" }),
      result({ order_number: "" }),
      result({ payment_status: "" }),
      result({ previous_fulfillment_status: "invented" }),
      result({ fulfillment_status: "invented" }),
      result({ outcome: "not_found", order_id: null }),
    ]

    let index = 0
    t.mock.method(globalThis, "fetch", async () => {
      return new Response(JSON.stringify(payloads[index++]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    })

    for (const _payload of payloads) {
      await assert.rejects(() =>
        transitionAdminOrderFulfillment({
          orderId: ORDER_ID,
          adminUserId: ADMIN_ID,
          targetStatus: "in_production",
        }),
      )
    }
  })
})

test("sanitizes storage and network failures", async (t) => {
  await withSupabaseEnv(async () => {
    let calls = 0
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1
      if (calls === 1) {
        return new Response(JSON.stringify({ message: "secret database detail" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }
      throw new Error("network secret detail")
    })

    for (let index = 0; index < 2; index += 1) {
      await assert.rejects(
        () =>
          transitionAdminOrderFulfillment({
            orderId: ORDER_ID,
            adminUserId: ADMIN_ID,
            targetStatus: "canceled",
          }),
        (error: unknown) =>
          error instanceof Error &&
          error.message === "Admin order operation failed" &&
          !error.message.includes("secret"),
      )
    }
  })
})
