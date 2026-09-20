import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import test from "node:test"
import {
  MELHOR_ENVIO_ACTIVE_SCOPES,
} from "../lib/server/melhor-envio-oauth-scopes.ts"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

async function exists(path: string) {
  try {
    await access(new URL(`../${path}`, import.meta.url))
    return true
  } catch {
    return false
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&")
}

test("Melhor Envio runtime exposes preparation only and no provider spending routes", async () => {
  assert.deepEqual([...MELHOR_ENVIO_ACTIVE_SCOPES], [
    "shipping-calculate",
    "cart-write",
  ])

  for (const path of [
    "app/api/internal/admin/shipments/[id]/purchase/route.ts",
    "app/api/internal/admin/shipments/[id]/reconcile/route.ts",
    "app/api/internal/admin/shipments/[id]/generate/route.ts",
    "app/api/internal/admin/shipments/[id]/print-label/route.ts",
    "app/api/internal/admin/shipments/[id]/print-dace/route.ts",
    "app/api/internal/admin/shipments/[id]/post/route.ts",
    "app/api/internal/admin/shipments/[id]/cancel/route.ts",
    "app/api/internal/melhor-envio/tracking/route.ts",
  ]) {
    assert.equal(await exists(path), false, `${path} must remain retired`)
  }

  assert.equal(
    await exists("app/api/internal/admin/orders/[id]/shipment/prepare/route.ts"),
    true,
  )
})

test("shipment panel only prepares, opens Melhor Envio, and never buys or generates labels", async () => {
  const panel = await source("components/admin/shipment-panel.tsx")

  assert.match(panel, /Preparar remessa/)
  assert.match(panel, /adiciona ao carrinho do Melhor Envio/i)
  assert.match(panel, /Abrir Melhor Envio/)
  assert.match(panel, /https:\/\/melhorenvio\.com\.br/)
  assert.match(panel, /shipment\/prepare/)

  for (const forbidden of [
    "Comprar etiqueta",
    "/purchase",
    "/reconcile",
    "/generate",
    "/print-label",
    "/print-dace",
    "/post",
    "/cancel",
    "Imprimir etiqueta",
    "Imprimir DACE",
    "Reconciliar compra",
  ]) {
    assert.doesNotMatch(panel, new RegExp(escapeRegex(forbidden), "i"))
  }
})

test("payment and fulfillment transitions cannot trigger Melhor Envio spending", async () => {
  const [webhook, readyRoute, shippedRoute] = await Promise.all([
    source("app/api/mercadopago/webhook/route.ts"),
    source("app/api/internal/admin/orders/[id]/mark-ready-to-ship/route.ts"),
    source("app/api/internal/admin/orders/[id]/mark-shipped/route.ts"),
  ])

  for (const text of [webhook, readyRoute, shippedRoute]) {
    assert.doesNotMatch(
      text,
      /purchaseMelhorEnvioShipment|shipping-checkout|generateMelhorEnvioShipment|cancelMelhorEnvioShipment/,
    )
  }

  assert.match(webhook, /applyMercadoPagoPaymentEvent/)
  assert.match(readyRoute, /targetStatus:\s*"ready_to_ship"/)
  assert.match(shippedRoute, /targetStatus:\s*"shipped"/)
})
