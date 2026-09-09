import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const ORDER_ID = "550e8400-e29b-41d4-a716-446655440000"
const SHIPMENT_ID = "660e8400-e29b-41d4-a716-446655440001"
const SENDER_ID = "770e8400-e29b-41d4-a716-446655440002"
const CREATED_AT = "2026-09-09T12:00:00.000Z"
const UPDATED_AT = "2026-09-09T13:00:00.000Z"

type PanelAction =
  | "prepare"
  | "purchase"
  | "reconcile_purchase"
  | "reconcile_cancel"
  | "generate"
  | "refresh_generation"
  | "print_label"
  | "print_dace"
  | "post"
  | "cancel"

type Difference =
  | { kind: "store_pays"; cents: number }
  | { kind: "margin"; cents: number }
  | { kind: "even"; cents: 0 }
  | null

interface ProjectionLike {
  id: string
  state: string
  environment: "sandbox" | "production"
  documentMode: "declaration_content" | "invoice"
  customerShippingCents: number
  providerCostCents: number | null
  purchasedCostCents: number | null
  attentionReason: string | null
}

interface ShipmentUiModule {
  deriveAdminShipmentPanelState?: (input: {
    orderFulfillmentStatus: string
    shipment: ProjectionLike | null
  }) => { actions: PanelAction[]; difference: Difference }
  getAdminShipmentProjectionForOrder?: (orderId: string) => Promise<unknown>
}

async function loadShipmentModule(): Promise<ShipmentUiModule> {
  return (await import("../lib/server/shipments.ts")) as ShipmentUiModule
}

function shipment(
  state: string,
  overrides: Partial<ProjectionLike> = {},
): ProjectionLike {
  return {
    id: SHIPMENT_ID,
    state,
    environment: "production",
    documentMode: "declaration_content",
    customerShippingCents: 1500,
    providerCostCents: 1842,
    purchasedCostCents: null,
    attentionReason: null,
    ...overrides,
  }
}

function actions(result: { actions: PanelAction[] }) {
  return [...result.actions].sort()
}

test("admin shipment state model exposes only the explicit action allowed by each state", async () => {
  const module = await loadShipmentModule()
  assert.equal(typeof module.deriveAdminShipmentPanelState, "function")
  const derive = module.deriveAdminShipmentPanelState as NonNullable<ShipmentUiModule["deriveAdminShipmentPanelState"]>

  assert.deepEqual(
    actions(derive({ orderFulfillmentStatus: "ready_to_ship", shipment: null })),
    ["prepare"],
  )
  assert.deepEqual(
    actions(derive({ orderFulfillmentStatus: "ready_to_ship", shipment: shipment("canceled") })),
    ["prepare"],
  )
  assert.deepEqual(
    actions(derive({ orderFulfillmentStatus: "ready_to_ship", shipment: shipment("in_cart") })),
    ["purchase"],
  )
  assert.deepEqual(
    actions(derive({ orderFulfillmentStatus: "ready_to_ship", shipment: shipment("purchase_pending") })),
    ["reconcile_purchase"],
  )
  assert.deepEqual(
    actions(derive({
      orderFulfillmentStatus: "ready_to_ship",
      shipment: shipment("attention_required", { attentionReason: "purchase_outcome_unknown" }),
    })),
    ["reconcile_purchase"],
  )
  assert.deepEqual(
    actions(derive({
      orderFulfillmentStatus: "ready_to_ship",
      shipment: shipment("attention_required", { attentionReason: "cancel_outcome_unknown" }),
    })),
    ["reconcile_cancel"],
  )
  assert.deepEqual(
    actions(derive({ orderFulfillmentStatus: "ready_to_ship", shipment: shipment("cancel_pending") })),
    ["reconcile_cancel"],
  )
  assert.deepEqual(
    actions(derive({ orderFulfillmentStatus: "ready_to_ship", shipment: shipment("purchased") })),
    ["generate"],
  )
  assert.deepEqual(
    actions(derive({ orderFulfillmentStatus: "ready_to_ship", shipment: shipment("generation_pending") })),
    ["refresh_generation"],
  )
  assert.deepEqual(
    actions(derive({ orderFulfillmentStatus: "ready_to_ship", shipment: shipment("generated") })),
    ["cancel", "post", "print_dace", "print_label"],
  )
  assert.deepEqual(
    actions(derive({
      orderFulfillmentStatus: "ready_to_ship",
      shipment: shipment("generated", { documentMode: "invoice" }),
    })),
    ["cancel", "post", "print_label"],
  )

  for (const state of ["posted", "in_transit", "delivered", "draft", "prepared"] as const) {
    assert.deepEqual(
      actions(derive({ orderFulfillmentStatus: "ready_to_ship", shipment: shipment(state) })),
      [],
      state,
    )
  }

  assert.deepEqual(
    actions(derive({ orderFulfillmentStatus: "shipped", shipment: null })),
    [],
  )
})

test("price difference is derived from customer-paid freight versus the current trusted label cost", async () => {
  const module = await loadShipmentModule()
  assert.equal(typeof module.deriveAdminShipmentPanelState, "function")
  const derive = module.deriveAdminShipmentPanelState as NonNullable<ShipmentUiModule["deriveAdminShipmentPanelState"]>

  assert.deepEqual(
    derive({ orderFulfillmentStatus: "ready_to_ship", shipment: shipment("in_cart") }).difference,
    { kind: "store_pays", cents: 342 },
  )
  assert.deepEqual(
    derive({
      orderFulfillmentStatus: "ready_to_ship",
      shipment: shipment("in_cart", { customerShippingCents: 2000 }),
    }).difference,
    { kind: "margin", cents: 158 },
  )
  assert.deepEqual(
    derive({
      orderFulfillmentStatus: "ready_to_ship",
      shipment: shipment("in_cart", { customerShippingCents: 1842 }),
    }).difference,
    { kind: "even", cents: 0 },
  )
  assert.equal(
    derive({
      orderFulfillmentStatus: "ready_to_ship",
      shipment: shipment("purchased", { providerCostCents: null }),
    }).difference,
    null,
  )
})

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

test("admin projection masks sender tax identity and never returns provider ids raw metadata or print resources", async () => {
  const module = await loadShipmentModule()
  assert.equal(typeof module.getAdminShipmentProjectionForOrder, "function")
  const readProjection = module.getAdminShipmentProjectionForOrder as NonNullable<ShipmentUiModule["getAdminShipmentProjectionForOrder"]>

  const originalFetch = globalThis.fetch
  const urls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    urls.push(url)
    if (url.includes("/shipment_events?")) {
      return new Response(JSON.stringify([
        { event_type: "shipment_added_to_cart", source: "melhor_envio", created_at: UPDATED_AT },
        { event_type: "unknown_future_event", source: "system", created_at: CREATED_AT },
      ]), { status: 200, headers: { "content-type": "application/json" } })
    }
    if (url.includes("/shipments?")) {
      return new Response(JSON.stringify([rawShipment()]), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    throw new Error(`unexpected url ${url}`)
  }) as typeof fetch

  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SECRET_KEY
  process.env.SUPABASE_URL = "https://project.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "service-role-test-key"

  try {
    const projection = await readProjection(ORDER_ID)
    assert.deepEqual(projection, {
      id: SHIPMENT_ID,
      state: "in_cart",
      environment: "production",
      documentMode: "declaration_content",
      serviceName: "PAC",
      carrierName: "Correios",
      customerShippingCents: 1500,
      providerCostCents: 1842,
      purchasedCostCents: null,
      trackingCode: "BR123456789BR",
      lastTrackingSyncAt: UPDATED_AT,
      attentionReason: null,
      sender: {
        personType: "pf",
        name: "Remetente Teste",
        maskedTaxId: "***.***.***-25",
      },
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      history: [
        {
          kind: "added_to_cart",
          source: "melhor_envio",
          createdAt: UPDATED_AT,
        },
      ],
    })

    const keys = collectKeys(projection)
    for (const forbidden of [
      "providerCartId",
      "providerShipmentId",
      "providerOrderId",
      "providerStatus",
      "senderSnapshot",
      "recipientSnapshot",
      "packageSnapshot",
      "declarationItemsSnapshot",
      "invoiceKey",
      "serviceId",
      "operationId",
      "operationKind",
      "metadata",
      "dedupeKey",
      "accessToken",
      "refreshToken",
      "printUrl",
      "daceUrl",
      "cpf",
      "cnpj",
    ]) {
      assert.equal(keys.has(forbidden), false, forbidden)
    }

    assert.equal(urls.length, 2)
    const shipmentUrl = urls.find((url) => url.includes("/shipments?")) ?? ""
    const eventUrl = urls.find((url) => url.includes("/shipment_events?")) ?? ""
    assert.match(shipmentUrl, /order_id=eq(?:\.|%2E)?550e8400-e29b-41d4-a716-446655440000/i)
    for (const forbidden of [
      "provider_cart_id",
      "provider_shipment_id",
      "provider_order_id",
      "provider_status",
      "recipient_snapshot",
      "package_snapshot",
      "declaration_items_snapshot",
      "operation_id",
    ]) {
      assert.doesNotMatch(decodeURIComponent(shipmentUrl), new RegExp(forbidden, "i"), forbidden)
    }
    assert.match(decodeURIComponent(eventUrl), /select=event_type,source,created_at/i)
    assert.doesNotMatch(decodeURIComponent(eventUrl), /metadata|dedupe_key/i)
  } finally {
    globalThis.fetch = originalFetch
    if (previousUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY
    else process.env.SUPABASE_SECRET_KEY = previousKey
  }
})

test("admin order page loads the safe shipment projection after auth and delegates shipment rendering", async () => {
  const page = await readFile(
    new URL("../app/admin/pedidos/[id]/page.tsx", import.meta.url),
    "utf8",
  )

  assert.match(page, /getAdminShipmentProjectionForOrder/)
  assert.match(page, /ShipmentPanel/)
  assert.ok(page.indexOf("requireAdminPageAccess") < page.indexOf("getAdminShipmentProjectionForOrder(id)"))
  assert.match(page, /order\.shipping_provider\s*===\s*["']melhor_envio["']/)
  assert.match(page, /target\s*===\s*["']shipped["']/)
  assert.doesNotMatch(page, /purchaseMelhorEnvioShipment|generateMelhorEnvioShipment|cancelMelhorEnvioShipment/)
})

test("shipment panel renders explicit state actions and never embeds private provider resources", async () => {
  const panel = await readFile(
    new URL("../components/admin/shipment-panel.tsx", import.meta.url),
    "utf8",
  )

  for (const copy of [
    "Revisar envio / DC-e",
    "Preparar remessa",
    "Cliente pagou",
    "Etiqueta agora",
    "Diferença",
    "loja paga",
    "margem",
    "Comprar etiqueta por",
    "Compra em verificação",
    "Reconciliar compra",
    "Gerar etiqueta",
    "Geração em andamento",
    "Atualizar estado",
    "Imprimir etiqueta",
    "Imprimir DACE",
    "Confirmar postagem",
    "Cancelar etiqueta",
    "Rastreamento",
  ]) {
    assert.match(panel, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), copy)
  }

  for (const route of [
    "shipment/prepare",
    "/purchase",
    "/reconcile",
    "/generate",
    "/print-label",
    "/print-dace",
    "/post",
    "/cancel",
  ]) {
    assert.match(panel, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), route)
  }

  assert.match(panel, /maskedTaxId/)
  assert.match(panel, /deriveAdminShipmentPanelState/)
  assert.doesNotMatch(
    panel,
    /providerShipmentId|providerOrderId|providerCartId|providerStatus|accessToken|refreshToken|printUrl|daceUrl|senderSnapshot|recipientSnapshot/,
  )
  assert.doesNotMatch(panel, /mark-shipped/)
  assert.doesNotMatch(panel, /fetch\s*\(/)
})

test("shipment purchase and cancellation confirmations are dedicated POST dialogs with no auto-spend fetch", async () => {
  const confirm = await readFile(
    new URL("../components/admin/shipment-confirm-action.tsx", import.meta.url),
    "utf8",
  )

  assert.match(confirm, /^["']use client["']/m)
  assert.match(confirm, /Dialog/)
  assert.match(confirm, /method=["']post["']/i)
  assert.match(confirm, /Production/)
  assert.match(confirm, /expectedCostCents/)
  assert.match(confirm, /type=["']hidden["'][^>]+name=["']expectedCostCents["']|name=["']expectedCostCents["'][^>]+type=["']hidden["']/i)
  assert.match(confirm, /confirmation/)
  assert.match(confirm, /cancel-label/)
  assert.match(confirm, /reembolso|estorno/i)
  assert.match(confirm, /estado atual/i)
  assert.match(confirm, /rose-/)
  assert.doesNotMatch(confirm, /providerShipmentId|providerOrderId|providerCartId|serviceId/)
  assert.doesNotMatch(confirm, /fetch\s*\(/)
  assert.doesNotMatch(confirm, /useEffect/)
})
