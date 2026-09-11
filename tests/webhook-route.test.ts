import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import test from "node:test"
import { NextRequest } from "next/server.js"
import { POST } from "../app/api/mercadopago/webhook/route.ts"

const SECRET = "webhook-secret-123456789012345678901234"
const ACCESS_TOKEN = "test-access-token"
const REQUEST_ID = "request-123"
const PAYMENT_ID = "175133542535"

const ENV_KEYS = [
  "MERCADO_PAGO_ENVIRONMENT",
  "MERCADO_PAGO_ACCESS_TOKEN",
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
] as const

async function withEnv(run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])

  process.env.MERCADO_PAGO_ENVIRONMENT = "sandbox"
  process.env.MERCADO_PAGO_ACCESS_TOKEN = ACCESS_TOKEN
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = SECRET
  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "supabase-secret"

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

function signature(dataId: string, requestId = REQUEST_ID) {
  const ts = "1770000000"
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const v1 = createHmac("sha256", SECRET).update(manifest).digest("hex")
  return `ts=${ts},v1=${v1}`
}

function webhookRequest(input?: {
  dataId?: string
  type?: string
  signature?: string
}) {
  const dataId = input?.dataId ?? PAYMENT_ID
  const type = input?.type ?? "payment"
  const url = new URL("https://preview.example.com/api/mercadopago/webhook")
  url.searchParams.set("data.id", dataId)
  url.searchParams.set("type", type)

  return new NextRequest(url, {
    method: "POST",
    headers: {
      "x-request-id": REQUEST_ID,
      "x-signature": input?.signature ?? signature(dataId),
      "content-type": "application/json",
    },
    body: JSON.stringify({ type }),
  })
}

test("rejects invalid HMAC before reading the body or calling providers", async (t) => {
  await withEnv(async () => {
    let bodyRead = false
    let fetchCalls = 0
    const request = webhookRequest({ signature: "ts=1,v1=deadbeef" })

    Object.defineProperty(request, "json", {
      value: async () => {
        bodyRead = true
        return { type: "payment" }
      },
    })
    Object.defineProperty(request, "text", {
      value: async () => {
        bodyRead = true
        return JSON.stringify({ type: "payment" })
      },
    })
    t.mock.method(globalThis, "fetch", async () => {
      fetchCalls += 1
      throw new Error("must not fetch")
    })

    const response = await POST(request)
    assert.equal(response.status, 401)
    assert.equal(bodyRead, false)
    assert.equal(fetchCalls, 0)
  })
})

test("ignores a valid signed non-payment topic without provider work", async (t) => {
  await withEnv(async () => {
    let fetchCalls = 0
    t.mock.method(globalThis, "fetch", async () => {
      fetchCalls += 1
      throw new Error("must not fetch")
    })

    const response = await POST(webhookRequest({ type: "merchant_order" }))
    assert.equal(response.status, 200)
    assert.equal(fetchCalls, 0)
  })
})

test("valid payment fetches Mercado Pago once and applies one atomic Supabase RPC", async (t) => {
  await withEnv(async () => {
    let mercadoPagoCalls = 0
    let rpcCalls = 0

    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        if (url.hostname === "api.mercadopago.com") {
          mercadoPagoCalls += 1
          assert.equal(url.pathname, `/v1/payments/${PAYMENT_ID}`)
          assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${ACCESS_TOKEN}`)
          return new Response(
            JSON.stringify({
              id: Number(PAYMENT_ID),
              status: "approved",
              status_detail: "accredited",
              transaction_amount: 138.32,
              external_reference: "PB-A1B2C3D4E5F6",
              currency_id: "BRL",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        }

        if (url.pathname === "/rest/v1/rpc/apply_mercadopago_payment_event") {
          rpcCalls += 1
          assert.deepEqual(JSON.parse(String(init?.body)), {
            p_order_number: "PB-A1B2C3D4E5F6",
            p_payment_id: PAYMENT_ID,
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
              payment_id: PAYMENT_ID,
              expected_cents: 13832,
              received_cents: 13832,
              fulfillment_status: "awaiting_production",
              fulfillment_transitioned: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        }

        throw new Error(`Unexpected fetch: ${url.toString()}`)
      },
    )

    const response = await POST(webhookRequest())
    assert.equal(response.status, 200)
    assert.equal(mercadoPagoCalls, 1)
    assert.equal(rpcCalls, 1)
  })
})

test("invalid order reference does not mutate Supabase", async (t) => {
  await withEnv(async () => {
    let rpcCalls = 0
    t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input))
      if (url.hostname === "api.mercadopago.com") {
        return new Response(
          JSON.stringify({
            id: Number(PAYMENT_ID),
            status: "approved",
            status_detail: "accredited",
            transaction_amount: 138.32,
            external_reference: "OTHER-ORDER",
            currency_id: "BRL",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      rpcCalls += 1
      throw new Error("must not mutate")
    })

    const response = await POST(webhookRequest())
    assert.equal(response.status, 200)
    assert.equal(rpcCalls, 0)
  })
})

test("temporary provider failure returns 500 so Mercado Pago can retry", async (t) => {
  await withEnv(async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async () => new Response(JSON.stringify({ message: "temporary" }), { status: 503 }),
    )

    const response = await POST(webhookRequest())
    assert.equal(response.status, 500)
  })
})
