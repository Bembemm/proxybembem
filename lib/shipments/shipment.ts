export const SHIPMENT_STATES = [
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

export const SHIPMENT_PROVIDERS = ["melhor_envio"] as const
export const SHIPMENT_ENVIRONMENTS = ["sandbox", "production"] as const
export const SHIPMENT_DOCUMENT_MODES = ["declaration_content", "invoice"] as const

export type ShipmentState = (typeof SHIPMENT_STATES)[number]
export type ShipmentProvider = (typeof SHIPMENT_PROVIDERS)[number]
export type ShipmentEnvironment = (typeof SHIPMENT_ENVIRONMENTS)[number]
export type ShipmentDocumentMode = (typeof SHIPMENT_DOCUMENT_MODES)[number]

function includesExact(values: readonly string[], value: unknown): value is string {
  return typeof value === "string" && values.includes(value)
}

export function isShipmentState(value: unknown): value is ShipmentState {
  return includesExact(SHIPMENT_STATES, value)
}

export function isShipmentProvider(value: unknown): value is ShipmentProvider {
  return includesExact(SHIPMENT_PROVIDERS, value)
}

export function isShipmentEnvironment(value: unknown): value is ShipmentEnvironment {
  return includesExact(SHIPMENT_ENVIRONMENTS, value)
}

export function isShipmentDocumentMode(value: unknown): value is ShipmentDocumentMode {
  return includesExact(SHIPMENT_DOCUMENT_MODES, value)
}
