import assert from "node:assert/strict"
import test from "node:test"
import { applyMercadoPagoPaymentEvent } from "../lib/server/orders.ts"

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

test("calls the atomic payment transition RPC with normalized argument names", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        assert.equal(
          String(input),
          "https://example.supabase.co/rest/v1/rpc/apply_mercadopago_payment_event",
        )
        assert.equal(init?.method, "POST")
        assert.deepEqual(JSON.parse(String(init?.body)), {
          p_order_number: "PB-A1B2C3D4E5F6",
          p_payment_id: "175133542535",
          p_incoming_status: "approved",
          p_status_detail: "accredited",
          p_paid_cents: 13832,
          p_currency_id: "BRL",
        })

        return new Response(
          JSON.stringify({
            outcome: "updated",
            order_number: "PB-A1B2C3D4E5F6",
            payment_status: "approved",
            payment_id: "175133542535",
            expected_cents: 13832,
            received_cents: 13832,
            fulfillment_status: "awaiting_production",
            fulfillment_transitioned: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      },
    )

    assert.deepEqual(
      await applyMercadoPagoPaymentEvent({
        orderNumber: "PB-A1B2C3D4E5F6",
        paymentId: "175133542535",
        incomingStatus: "approved",
        statusDetail: "accredited",
        paidCents: 13832,
        currencyId: "BRL",
      }),
      {
        outcome: "updated",
        order_number: "PB-A1B2C3D4E5F6",
        payment_status: "approved",
        payment_id: "175133542535",
        expected_cents: 13832,
        received_cents: 13832,
        fulfillment_status: "awaiting_production",
        fulfillment_transitioned: true,
      },
    )
  })
})

test("rejects malformed atomic payment RPC responses", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(globalThis, "fetch", async () => new Response("[]", { status: 200 }))

    await assert.rejects(() =>
      applyMercadoPagoPaymentEvent({
        orderNumber: "PB-A1B2C3D4E5F6",
        paymentId: "175133542535",
        incomingStatus: "approved",
        statusDetail: null,
        paidCents: 13832,
        currencyId: "BRL",
      }),
    )
  })
})

test("rejects unknown fulfillment status from the payment RPC", async (t) => {
  await withSupabaseEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            outcome: "updated",
            order_number: "PB-A1B2C3D4E5F6",
            payment_status: "approved",
            payment_id: "175133542535",
            expected_cents: 13832,
            received_cents: 13832,
            fulfillment_status: "made_up_status",
            fulfillment_transitioned: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    )

    await assert.rejects(() =>
      applyMercadoPagoPaymentEvent({
        orderNumber: "PB-A1B2C3D4E5F6",
        paymentId: "175133542535",
        incomingStatus: "approved",
        statusDetail: null,
        paidCents: 13832,
        currencyId: "BRL",
      }),
    )
  })
})
