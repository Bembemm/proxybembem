import assert from "node:assert/strict"
import test from "node:test"
import { transitionAdminOrderFulfillment } from "../lib/server/admin-order-operations.ts"

const ORDER_ID = "11111111-1111-4111-8111-111111111111"
const ADMIN_ID = "22222222-2222-4222-8222-222222222222"

async function withSupabaseEnv(run: () => Promise<void>) {
  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SECRET_KEY
  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "server-secret"

  try {
    await run()
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY
    else process.env.SUPABASE_SECRET_KEY = previousKey
  }
}

test("fulfillment operation accepts bounded non-PB order numbers returned by storage", async (t) => {
  await withSupabaseEnv(async () => {
    const expected = {
      outcome: "transitioned",
      order_id: ORDER_ID,
      order_number: "TEST-ME-20260911-070444",
      payment_status: "approved",
      previous_fulfillment_status: "ready_to_ship",
      fulfillment_status: "canceled",
    }

    t.mock.method(globalThis, "fetch", async () => {
      return new Response(JSON.stringify(expected), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    })

    assert.deepEqual(
      await transitionAdminOrderFulfillment({
        orderId: ORDER_ID,
        adminUserId: ADMIN_ID,
        targetStatus: "canceled",
      }),
      expected,
    )
  })
})
