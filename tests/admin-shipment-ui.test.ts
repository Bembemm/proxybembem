import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  getAdminShipmentProjectionForOrder,
} from "../lib/server/shipments.ts"

const ORDER_ID = "550e8400-e29b-41d4-a716-446655440000"
const SHIPMENT_ID = "660e8400-e29b-41d4-a716-446655440001"
const SENDER_ID = "770e8400-e29b-41d4-a716-446655440002"
const CREATED_AT = "2026-09-09T12:00:00.000Z"
const UPDATED_AT = "2026-09-09T13:00:00.000Z"

function rawShipment() {
  return {
    id: SHIPMENT_ID,
    order_id: ORDER_ID,
    sender_profile_id: SENDER_ID,
    sender_profile_version: 3,
    provider: "melhor_envio",
    environment: "production",
    document_mode: "declaration_content",
    invoice_key: null,
    state: "in_cart",
    stable_state_before_attention: null,
    service_id: "1",
    service_name: "PAC",
    carrier_name: "Correios",
    customer_shipping_cents: 1500,
    provider_cost_cents: 1842,
    purchased_cost_cents: null,
    currency: "BRL",
    recipient_snapshot: { name: "Cliente" },
    sender_snapshot: {
      personType: "pf",
      fullName: "Remetente Teste",
      cpf: "52998224725",
      cnpj: null,
      email: "sender@example.com",
    },
    package_snapshot: { weight: 0.25 },
    declaration_items_snapshot: [{ productId: 1 }],
    provider_cart_id: "cart-secret-internal",
    provider_shipment_id: "shipment-secret-internal",
    provider_order_id: "order-secret-internal",
    tracking_code: "BR123456789BR",
    provider_status: "raw-provider-status",
    last_tracking_sync_at: UPDATED_AT,
    attention_reason: null,
    operation_kind: null,
    operation_id: null,
    version: 4,
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
  }
}

function collectKeys(value: unknown, output = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, output)
    return output
  }
  if (!value || typeof value !== "object") return output
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    output.add(key)
    collectKeys(child, output)
  }
  return output
}

test("admin shipment projection stays sanitized even for historical rows", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes("/shipment_events?")) {
      return Response.json([
        {
          event_type: "shipment_added_to_cart",
          source: "melhor_envio",
          created_at: UPDATED_AT,
        },
      ])
    }
    if (url.includes("/shipments?")) return Response.json([rawShipment()])
    throw new Error(`unexpected url ${url}`)
  }) as typeof fetch

  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SECRET_KEY
  process.env.SUPABASE_URL = "https://project.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "service-role-test-key"

  try {
    const projection = await getAdminShipmentProjectionForOrder(ORDER_ID)
    assert.ok(projection)
    assert.equal(projection.state, "in_cart")
    assert.equal(projection.sender.maskedTaxId, "***.***.***-25")

    const keys = collectKeys(projection)
    for (const forbidden of [
      "providerCartId",
      "providerShipmentId",
      "providerOrderId",
      "providerStatus",
      "senderSnapshot",
      "recipientSnapshot",
      "accessToken",
      "refreshToken",
      "cpf",
      "cnpj",
    ]) {
      assert.equal(keys.has(forbidden), false, forbidden)
    }
  } finally {
    globalThis.fetch = originalFetch
    if (previousUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY
    else process.env.SUPABASE_SECRET_KEY = previousKey
  }
})

test("admin order keeps Melhor Envio preparation and restores manual shipped action", async () => {
  const page = await readFile(
    new URL("../app/admin/pedidos/[id]/page.tsx", import.meta.url),
    "utf8",
  )

  assert.match(page, /ShipmentPanel/)
  assert.match(page, /mark-shipped/)
  assert.doesNotMatch(
    page,
    /shipping_provider\s*===\s*["']melhor_envio["']\)\s*return null/,
  )
})

test("shipment panel is prepare-only and hands the operator off to Melhor Envio", async () => {
  const panel = await readFile(
    new URL("../components/admin/shipment-panel.tsx", import.meta.url),
    "utf8",
  )

  for (const expected of [
    "Preparar remessa",
    "adiciona ao carrinho do Melhor Envio",
    "Abrir Melhor Envio",
    "Compra, geração, impressão",
    "Valor informado ao preparar",
  ]) {
    assert.match(panel, new RegExp(expected, "i"))
  }

  assert.match(panel, /shipment\/prepare/)
  assert.match(panel, /https:\/\/melhorenvio\.com\.br/)

  for (const forbidden of [
    "/purchase",
    "/reconcile",
    "/generate",
    "/print-label",
    "/print-dace",
    "/post",
    "/cancel",
    "Comprar etiqueta por",
    "Reconciliar compra",
    "Gerar etiqueta",
    "Imprimir etiqueta",
    "Imprimir DACE",
    "Cancelar etiqueta",
  ]) {
    assert.doesNotMatch(panel, new RegExp(forbidden.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&"), "i"))
  }

  assert.doesNotMatch(
    panel,
    /providerShipmentId|providerOrderId|providerCartId|accessToken|refreshToken/,
  )
})
