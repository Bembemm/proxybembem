import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609080004_shipment_operations.sql",
  import.meta.url,
)
const SHIPMENT_ID = "11111111-1111-4111-8111-111111111111"
const ORDER_ID = "22222222-2222-4222-8222-222222222222"
const ADMIN_ID = "33333333-3333-4333-8333-333333333333"
const SENDER_ID = "44444444-4444-4444-8444-444444444444"
const INVOICE_KEY = "35190905481336000137550010000011011479837410"

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

test("draft RPC validates declaration/PF and invoice/PJ document combinations", async () => {
  const sql = (await readFile(MIGRATION, "utf8")).toLowerCase()
  const start = sql.indexOf("function public.admin_create_shipment_draft")
  const end = sql.indexOf("function public.admin_claim_shipment_prepare", start)
  assert.ok(start >= 0 && end > start)
  const block = sql.slice(start, end)

  assert.match(block, /p_document_mode/)
  assert.match(block, /p_invoice_key/)
  assert.match(block, /declaration_content/)
  assert.match(block, /invoice/)
  assert.match(block, /person_type[\s\S]*'pf'/)
  assert.match(block, /person_type[\s\S]*'pj'/)
  assert.match(block, /invoice_key/)
})

test("shipment repository accepts invoice rows only with a valid persisted NF-e key", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await import("../lib/server/shipments.ts")
    let calls = 0
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1
      return Response.json([
        {
          id: SHIPMENT_ID,
          order_id: ORDER_ID,
          sender_profile_id: SENDER_ID,
          sender_profile_version: 2,
          provider: "melhor_envio",
          environment: "production",
          document_mode: "invoice",
          invoice_key: INVOICE_KEY,
          state: "draft",
          stable_state_before_attention: null,
          service_id: "1",
          service_name: "PAC",
          carrier_name: "Correios",
          customer_shipping_cents: 1990,
          provider_cost_cents: null,
          purchased_cost_cents: null,
          currency: "BRL",
          recipient_snapshot: { name: "Cliente" },
          sender_snapshot: { fullName: "Proxy Bem Bem" },
          package_snapshot: { height: 4, width: 19, length: 25, weight: 0.25 },
          declaration_items_snapshot: [{ productId: 1, quantity: 1, unitValueCents: 11990 }],
          provider_cart_id: null,
          provider_shipment_id: null,
          provider_order_id: null,
          tracking_code: null,
          provider_status: null,
          last_tracking_sync_at: null,
          attention_reason: null,
          operation_kind: null,
          operation_id: null,
          version: 1,
          created_at: "2026-09-09T10:00:00.000Z",
          updated_at: "2026-09-09T10:00:00.000Z",
        },
      ])
    })

    const shipment = await module.getShipmentById(SHIPMENT_ID)
    assert.equal(calls, 1)
    assert.equal(shipment?.documentMode, "invoice")
    assert.equal(shipment?.invoiceKey, INVOICE_KEY)
  })
})

test("invoice draft forwards the trusted document mode and NF-e key to the atomic RPC", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await import("../lib/server/shipment-operations.ts")
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        assert.equal(
          String(input),
          "https://example.supabase.co/rest/v1/rpc/admin_create_shipment_draft",
        )
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        assert.equal(body.p_document_mode, "invoice")
        assert.equal(body.p_invoice_key, INVOICE_KEY)
        assert.equal(body.p_order_id, ORDER_ID)
        assert.equal(body.p_sender_profile_id, SENDER_ID)
        assert.ok(!("p_payment_status" in body))
        assert.ok(!("p_customer_id" in body))
        return Response.json({
          outcome: "created",
          shipment_id: SHIPMENT_ID,
          order_id: ORDER_ID,
          previous_state: null,
          state: "draft",
          version: 1,
        })
      },
    )

    const result = await module.createShipmentDraft({
      orderId: ORDER_ID,
      adminUserId: ADMIN_ID,
      senderProfileId: SENDER_ID,
      senderProfileVersion: 2,
      environment: "production",
      documentMode: "invoice",
      invoiceKey: INVOICE_KEY,
      serviceId: "1",
      serviceName: "PAC",
      carrierName: "Correios",
      customerShippingCents: 1990,
      recipientSnapshot: { name: "Cliente", postalCode: "01001000" },
      senderSnapshot: { fullName: "Proxy Bem Bem", postalCode: "86730000" },
      packageSnapshot: { height: 4, width: 19, length: 25, weight: 0.25 },
      declarationItemsSnapshot: [
        { productId: 1, description: "Proxy MTG", quantity: 1, unitValueCents: 11990 },
      ],
    })

    assert.equal(result.outcome, "created")
    assert.equal(result.state, "draft")
  })
})
