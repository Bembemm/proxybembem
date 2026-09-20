import assert from "node:assert/strict"
import test from "node:test"
import { reconcileMercadoPagoOrderPayment } from "../lib/server/payment-reconciliation.ts"

const ORDER_NUMBER = "PB-A1B2C3D4E5F6"
const ACCESS_TOKEN = "provider-token"

async function withSupabaseEnv(run: () => Promise<void>) {
  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SECRET_KEY
  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "supabase-secret"
  try {
    await run()
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY
    else process.env.SUPABASE_SECRET_KEY = previousKey
  }
}

test("reconciliation prefers an approved payment over newer failed attempts", async (t) => {
  await withSupabaseEnv(async () => {
    const fetchedPaymentIds: string[] = []
    let rpcCalls = 0

    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))

        if (url.hostname === "api.mercadopago.com" && url.pathname === "/v1/payments/search") {
          assert.equal(url.searchParams.get("external_reference"), ORDER_NUMBER)
          assert.equal(url.searchParams.get("sort"), "date_last_updated")
          assert.equal(url.searchParams.get("criteria"), "desc")
          return Response.json({
            results: [
              { id: 200, status: "rejected" },
              { id: 100, status: "approved" },
            ],
          })
        }

        if (url.hostname === "api.mercadopago.com" && url.pathname.startsWith("/v1/payments/")) {
          fetchedPaymentIds.push(url.pathname.split("/").at(-1) ?? "")
          assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${ACCESS_TOKEN}`)
          return Response.json({
            id: 100,
            status: "approved",
            status_detail: "accredited",
            transaction_amount: 25.74,
            external_reference: ORDER_NUMBER,
            currency_id: "BRL",
          })
        }

        if (url.pathname === "/rest/v1/rpc/apply_mercadopago_payment_event") {
          rpcCalls += 1
          assert.deepEqual(JSON.parse(String(init?.body)), {
            p_order_number: ORDER_NUMBER,
            p_payment_id: "100",
            p_incoming_status: "approved",
            p_status_detail: "accredited",
            p_paid_cents: 2574,
            p_currency_id: "BRL",
          })
          return Response.json({
            outcome: "updated",
            order_number: ORDER_NUMBER,
            payment_status: "approved",
            payment_id: "100",
            expected_cents: 2574,
            received_cents: 2574,
            fulfillment_status: "awaiting_production",
            fulfillment_transitioned: true,
          })
        }

        throw new Error(`Unexpected fetch: ${url.toString()}`)
      },
    )

    const result = await reconcileMercadoPagoOrderPayment({
      orderNumber: ORDER_NUMBER,
      currentPaymentId: null,
      currentPaymentStatus: "pending",
      accessToken: ACCESS_TOKEN,
    })

    assert.deepEqual(fetchedPaymentIds, ["100"])
    assert.equal(rpcCalls, 1)
    assert.deepEqual(result, {
      outcome: "updated",
      paymentStatus: "approved",
      paymentId: "100",
    })
  })
})

test("reconciliation does not turn a pending order into a rejected attempt", async (t) => {
  await withSupabaseEnv(async () => {
    let nonSearchCalls = 0

    t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input))
      if (url.hostname === "api.mercadopago.com" && url.pathname === "/v1/payments/search") {
        return Response.json({ results: [{ id: 200, status: "rejected" }] })
      }
      nonSearchCalls += 1
      throw new Error("rejected attempts must not mutate the order")
    })

    const result = await reconcileMercadoPagoOrderPayment({
      orderNumber: ORDER_NUMBER,
      currentPaymentId: null,
      currentPaymentStatus: "pending",
      accessToken: ACCESS_TOKEN,
    })

    assert.equal(nonSearchCalls, 0)
    assert.deepEqual(result, {
      outcome: "ignored",
      paymentStatus: "rejected",
      paymentId: "200",
    })
  })
})

test("reconciliation rechecks an already approved payment for later reversals", async (t) => {
  await withSupabaseEnv(async () => {
    let searchCalls = 0
    let rpcCalls = 0

    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))

        if (url.pathname === "/v1/payments/search") {
          searchCalls += 1
          throw new Error("approved orders should fetch their known payment directly")
        }

        if (url.hostname === "api.mercadopago.com" && url.pathname === "/v1/payments/100") {
          return Response.json({
            id: 100,
            status: "refunded",
            status_detail: "refunded",
            transaction_amount: 25.74,
            external_reference: ORDER_NUMBER,
            currency_id: "BRL",
          })
        }

        if (url.pathname === "/rest/v1/rpc/apply_mercadopago_payment_event") {
          rpcCalls += 1
          return Response.json({
            outcome: "updated",
            order_number: ORDER_NUMBER,
            payment_status: "refunded",
            payment_id: "100",
            expected_cents: 2574,
            received_cents: 2574,
            fulfillment_status: "awaiting_production",
            fulfillment_transitioned: false,
          })
        }

        throw new Error(`Unexpected fetch: ${url.toString()}`)
      },
    )

    const result = await reconcileMercadoPagoOrderPayment({
      orderNumber: ORDER_NUMBER,
      currentPaymentId: "100",
      currentPaymentStatus: "approved",
      accessToken: ACCESS_TOKEN,
    })

    assert.equal(searchCalls, 0)
    assert.equal(rpcCalls, 1)
    assert.equal(result.paymentStatus, "refunded")
  })
})
