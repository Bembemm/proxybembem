import assert from "node:assert/strict"
import test from "node:test"

type ShipmentDomainModule = {
  SHIPMENT_STATES: readonly string[]
  SHIPMENT_PROVIDERS: readonly string[]
  SHIPMENT_ENVIRONMENTS: readonly string[]
  SHIPMENT_DOCUMENT_MODES: readonly string[]
  isShipmentState(value: unknown): boolean
  isShipmentProvider(value: unknown): boolean
  isShipmentEnvironment(value: unknown): boolean
  isShipmentDocumentMode(value: unknown): boolean
}

async function loadDomain(): Promise<ShipmentDomainModule> {
  const moduleUrl = new URL("../lib/shipments/shipment.ts", import.meta.url).href
  return (await import(moduleUrl)) as ShipmentDomainModule
}

const EXPECTED_STATES = [
  "draft",
  "prepared",
  "in_cart",
  "purchase_pending",
  "purchased",
  "generation_pending",
  "generated",
  "posted",
  "in_transit",
  "delivered",
  "cancel_pending",
  "canceled",
  "attention_required",
] as const

test("shipment domain exports the exact approved state provider environment and document vocabularies", async () => {
  const domain = await loadDomain()

  assert.deepEqual(domain.SHIPMENT_STATES, EXPECTED_STATES)
  assert.deepEqual(domain.SHIPMENT_PROVIDERS, ["melhor_envio"])
  assert.deepEqual(domain.SHIPMENT_ENVIRONMENTS, ["sandbox", "production"])
  assert.deepEqual(domain.SHIPMENT_DOCUMENT_MODES, ["declaration_content", "invoice"])
})

test("shipment domain guards accept only exact persisted vocabulary values", async () => {
  const domain = await loadDomain()

  for (const state of EXPECTED_STATES) assert.equal(domain.isShipmentState(state), true)
  for (const bad of [null, undefined, 1, "", "READY", "ready_to_ship", "attention-required"]) {
    assert.equal(domain.isShipmentState(bad), false)
  }

  assert.equal(domain.isShipmentProvider("melhor_envio"), true)
  assert.equal(domain.isShipmentProvider("correios"), false)
  assert.equal(domain.isShipmentEnvironment("sandbox"), true)
  assert.equal(domain.isShipmentEnvironment("production"), true)
  assert.equal(domain.isShipmentEnvironment("preview"), false)
  assert.equal(domain.isShipmentDocumentMode("declaration_content"), true)
  assert.equal(domain.isShipmentDocumentMode("invoice"), true)
  assert.equal(domain.isShipmentDocumentMode("mei"), false)
})
