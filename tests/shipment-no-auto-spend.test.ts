import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  createShipmentPurchaseService,
  type ShipmentPurchaseServiceDependencies,
} from "../lib/server/shipment-lifecycle-service.ts"
import { MelhorEnvioShipmentProviderError } from "../lib/server/melhor-envio-shipment-client.ts"
import type { ShipmentOperationResult } from "../lib/server/shipment-operations.ts"

const SHIPMENT_ID = "11111111-1111-4111-8111-111111111111"
const ORDER_ID = "22222222-2222-4222-8222-222222222222"
const ADMIN_ID = "33333333-3333-4333-8333-333333333333"
const OPERATION_ID = "44444444-4444-4444-8444-444444444444"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

function transitioned(
  previousState: ShipmentOperationResult["previousState"],
  state: ShipmentOperationResult["state"],
  version: number,
): ShipmentOperationResult {
  return {
    outcome: "transitioned",
    shipmentId: SHIPMENT_ID,
    orderId: ORDER_ID,
    previousState,
    state,
    version,
  }
}

function basePurchaseDeps(overrides: Partial<ShipmentPurchaseServiceDependencies> = {}): ShipmentPurchaseServiceDependencies {
  return {
    getConfig: () => ({ environment: "production", labelPurchaseEnabled: true }),
    getShipment: async () => ({
      id: SHIPMENT_ID,
      orderId: ORDER_ID,
      environment: "production",
      provider: "melhor_envio",
      state: "in_cart",
      stableStateBeforeAttention: null,
      attentionReason: null,
      providerShipmentId: "provider-shipment-1",
      providerCostCents: 1890,
      purchasedCostCents: null,
      operationKind: null,
      operationId: null,
      version: 1,
    }),
    readProvider: async () => ({
      providerShipmentId: "provider-shipment-1",
      status: "pending",
      priceCents: 1890,
      trackingCode: null,
      trackingUrl: null,
    }),
    claimPurchase: async () => transitioned("in_cart", "purchase_pending", 2),
    checkout: async () => ({ providerOrderId: "provider-order-1", purchasedCostCents: 1890 }),
    commitPurchase: async () => transitioned("purchase_pending", "purchased", 3),
    revertPurchase: async () => transitioned("purchase_pending", "in_cart", 3),
    markAttention: async () => transitioned("purchase_pending", "attention_required", 3),
    resolveReconciliation: async () => transitioned("attention_required", "purchased", 3),
    createOperationId: () => OPERATION_ID,
    ...overrides,
  }
}

test("disabled purchase capability guarantees zero provider reads and zero checkout calls", async () => {
  let shipmentReads = 0
  let providerReads = 0
  let checkoutCalls = 0
  const service = createShipmentPurchaseService(basePurchaseDeps({
    getConfig: () => ({ environment: "production", labelPurchaseEnabled: false }),
    getShipment: async () => {
      shipmentReads += 1
      return null
    },
    readProvider: async () => {
      providerReads += 1
      throw new Error("must not read provider while spending is disabled")
    },
    checkout: async () => {
      checkoutCalls += 1
      throw new Error("must not spend while capability is disabled")
    },
  }))

  const result = await service.purchaseAdminShipment({
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedCostCents: 1890,
  })

  assert.deepEqual(result, { outcome: "purchase_disabled" })
  assert.equal(shipmentReads, 0)
  assert.equal(providerReads, 0)
  assert.equal(checkoutCalls, 0)
})

test("ambiguous checkout invokes provider checkout once total and moves to reconciliation attention", async () => {
  let checkoutCalls = 0
  let attentionCalls = 0
  const service = createShipmentPurchaseService(basePurchaseDeps({
    checkout: async () => {
      checkoutCalls += 1
      throw new MelhorEnvioShipmentProviderError("outcome_unknown", null)
    },
    markAttention: async () => {
      attentionCalls += 1
      return transitioned("purchase_pending", "attention_required", 3)
    },
  }))

  const result = await service.purchaseAdminShipment({
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedCostCents: 1890,
  })

  assert.equal(checkoutCalls, 1)
  assert.equal(attentionCalls, 1)
  assert.deepEqual(result, {
    outcome: "attention_required",
    shipmentId: SHIPMENT_ID,
    orderId: ORDER_ID,
    reason: "purchase_outcome_unknown",
  })
})

test("payment webhook and ready-to-ship operation cannot reach shipment purchase", async () => {
  const [webhook, readyRoute] = await Promise.all([
    source("app/api/mercadopago/webhook/route.ts"),
    source("app/api/internal/admin/orders/[id]/mark-ready-to-ship/route.ts"),
  ])

  for (const [label, text] of [["payment webhook", webhook], ["ready-to-ship", readyRoute]] as const) {
    assert.doesNotMatch(text, /purchaseAdminShipment|purchaseMelhorEnvioShipment|checkoutMelhorEnvio/i, label)
    assert.doesNotMatch(text, /shipment-lifecycle-service|shipment-service\.ts/i, label)
  }
  assert.match(webhook, /applyMercadoPagoPaymentEvent/)
  assert.match(readyRoute, /targetStatus:\s*"ready_to_ship"/)
})

test("tracking cron imports only tracking behavior and never checkout generate or cancel", async () => {
  const [route, tracking] = await Promise.all([
    source("app/api/internal/melhor-envio/tracking/route.ts"),
    source("lib/server/shipment-tracking.ts"),
  ])

  assert.match(route, /refreshActiveShipmentTrackingBatch/)
  assert.doesNotMatch(route, /shipment-service|purchase|generate|cancel/i)
  assert.match(tracking, /trackMelhorEnvioShipments/)
  assert.doesNotMatch(
    tracking,
    /purchaseMelhorEnvioShipment|generateMelhorEnvioShipment|cancelMelhorEnvioShipment|addShipmentToMelhorEnvioCart/,
  )
})

test("admin page rendering cannot call provider checkout and confirmations remain explicit POST forms", async () => {
  const [page, panel, confirmation] = await Promise.all([
    source("app/admin/pedidos/[id]/page.tsx"),
    source("components/admin/shipment-panel.tsx"),
    source("components/admin/shipment-confirm-action.tsx"),
  ])

  for (const text of [page, panel, confirmation]) {
    assert.doesNotMatch(text, /purchaseMelhorEnvioShipment|checkoutMelhorEnvio|melhor-envio-shipment-client/)
  }
  assert.doesNotMatch(page, /purchaseAdminShipment|shipment-service\.ts/)
  assert.match(confirmation, /<form method="post" action=\{props\.action\}>/)
  assert.doesNotMatch(confirmation, /\bfetch\s*\(/)
})

test("generation module is isolated from order fulfillment transitions", async () => {
  const generation = await source("lib/server/shipment-generation.ts")

  assert.match(generation, /commitShipmentGeneration/)
  assert.doesNotMatch(
    generation,
    /transitionAdminOrderFulfillment|applyShipmentTrackingUpdate|postAdminShipment|fulfillment_status|mark-shipped/,
  )
})
