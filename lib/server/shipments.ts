import { getSupabaseEnv } from "./env.ts"
import {
  isShipmentDocumentMode,
  isShipmentEnvironment,
  isShipmentProvider,
  isShipmentState,
  type ShipmentDocumentMode,
  type ShipmentEnvironment,
  type ShipmentState,
} from "../shipments/shipment.ts"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INVOICE_KEY_RE = /^\d{44}$/
const OPERATION_KINDS = ["prepare", "purchase", "generation", "cancel", "posting"] as const
const STABLE_STATES = ["draft", "prepared", "in_cart", "purchased", "generated", "posted", "in_transit", "delivered", "canceled"] as const

const SHIPMENT_SELECT = [
  "id",
  "order_id",
  "sender_profile_id",
  "sender_profile_version",
  "provider",
  "environment",
  "document_mode",
  "invoice_key",
  "state",
  "stable_state_before_attention",
  "service_id",
  "service_name",
  "carrier_name",
  "customer_shipping_cents",
  "provider_cost_cents",
  "purchased_cost_cents",
  "currency",
  "recipient_snapshot",
  "sender_snapshot",
  "package_snapshot",
  "declaration_items_snapshot",
  "provider_cart_id",
  "provider_shipment_id",
  "provider_order_id",
  "tracking_code",
  "provider_status",
  "last_tracking_sync_at",
  "attention_reason",
  "operation_kind",
  "operation_id",
  "version",
  "created_at",
  "updated_at",
].join(",")

type ShipmentOperationKind = (typeof OPERATION_KINDS)[number]
type StableShipmentState = (typeof STABLE_STATES)[number]

export interface ShipmentRecord {
  id: string
  orderId: string
  senderProfileId: string
  senderProfileVersion: number
  provider: "melhor_envio"
  environment: ShipmentEnvironment
  documentMode: ShipmentDocumentMode
  invoiceKey?: string
  state: ShipmentState
  stableStateBeforeAttention: StableShipmentState | null
  serviceId: string
  serviceName: string
  carrierName: string
  customerShippingCents: number
  providerCostCents: number | null
  purchasedCostCents: number | null
  currency: "BRL"
  recipientSnapshot: Record<string, unknown>
  senderSnapshot: Record<string, unknown>
  packageSnapshot: Record<string, unknown>
  declarationItemsSnapshot: unknown[]
  providerCartId: string | null
  providerShipmentId: string | null
  providerOrderId: string | null
  trackingCode: string | null
  providerStatus: string | null
  lastTrackingSyncAt: string | null
  attentionReason: string | null
  operationKind: ShipmentOperationKind | null
  operationId: string | null
  version: number
  createdAt: string
  updatedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function isNullableNonnegativeInteger(value: unknown): value is number | null {
  return value === null || isNonnegativeInteger(value)
}

function isBoundedString(value: unknown, max = 128): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max
}

function isNullableBoundedString(value: unknown, max = 128): value is string | null {
  return value === null || isBoundedString(value, max)
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value))
}

function isNullableIsoTimestamp(value: unknown): value is string | null {
  return value === null || isIsoTimestamp(value)
}

function isOperationKind(value: unknown): value is ShipmentOperationKind {
  return typeof value === "string" && (OPERATION_KINDS as readonly string[]).includes(value)
}

function isStableState(value: unknown): value is StableShipmentState {
  return typeof value === "string" && (STABLE_STATES as readonly string[]).includes(value)
}

function invalid(): never {
  throw new Error("Shipment storage returned an invalid response")
}

function parseShipment(value: unknown): ShipmentRecord {
  if (!isRecord(value)) invalid()

  if (
    typeof value.id !== "string" || !UUID_RE.test(value.id) ||
    typeof value.order_id !== "string" || !UUID_RE.test(value.order_id) ||
    typeof value.sender_profile_id !== "string" || !UUID_RE.test(value.sender_profile_id) ||
    !isPositiveInteger(value.sender_profile_version) ||
    !isShipmentProvider(value.provider) ||
    !isShipmentEnvironment(value.environment) ||
    !isShipmentDocumentMode(value.document_mode) ||
    !isShipmentState(value.state) ||
    !isBoundedString(value.service_id, 64) ||
    !isBoundedString(value.service_name, 120) ||
    !isBoundedString(value.carrier_name, 120) ||
    !isNonnegativeInteger(value.customer_shipping_cents) ||
    !isNullableNonnegativeInteger(value.provider_cost_cents) ||
    !isNullableNonnegativeInteger(value.purchased_cost_cents) ||
    value.currency !== "BRL" ||
    !isRecord(value.recipient_snapshot) ||
    !isRecord(value.sender_snapshot) ||
    !isRecord(value.package_snapshot) ||
    !Array.isArray(value.declaration_items_snapshot) || value.declaration_items_snapshot.length < 1 ||
    !isNullableBoundedString(value.provider_cart_id) ||
    !isNullableBoundedString(value.provider_shipment_id) ||
    !isNullableBoundedString(value.provider_order_id) ||
    !isNullableBoundedString(value.tracking_code) ||
    !isNullableBoundedString(value.provider_status) ||
    !isNullableIsoTimestamp(value.last_tracking_sync_at) ||
    !(value.attention_reason === null || isBoundedString(value.attention_reason, 64)) ||
    !isPositiveInteger(value.version) ||
    !isIsoTimestamp(value.created_at) ||
    !isIsoTimestamp(value.updated_at)
  ) invalid()

  const invoiceKey = value.invoice_key
  if (value.document_mode === "invoice") {
    if (typeof invoiceKey !== "string" || !INVOICE_KEY_RE.test(invoiceKey)) invalid()
  } else if (!(invoiceKey === undefined || invoiceKey === null)) {
    invalid()
  }

  const stable = value.stable_state_before_attention
  if (!(stable === null || isStableState(stable))) invalid()
  if (value.state === "attention_required") {
    if (stable === null || !isBoundedString(value.attention_reason, 64)) invalid()
  } else {
    if (value.attention_reason !== null) invalid()
    if (stable !== null && value.state !== "cancel_pending") invalid()
  }

  const operationKind = value.operation_kind
  const operationId = value.operation_id
  if (operationKind === null && operationId === null) {
    // valid idle row
  } else if (
    isOperationKind(operationKind) &&
    typeof operationId === "string" &&
    UUID_RE.test(operationId)
  ) {
    // valid durable operation claim
  } else {
    invalid()
  }

  const result: ShipmentRecord = {
    id: value.id,
    orderId: value.order_id,
    senderProfileId: value.sender_profile_id,
    senderProfileVersion: value.sender_profile_version,
    provider: value.provider,
    environment: value.environment,
    documentMode: value.document_mode,
    state: value.state,
    stableStateBeforeAttention: stable,
    serviceId: value.service_id,
    serviceName: value.service_name,
    carrierName: value.carrier_name,
    customerShippingCents: value.customer_shipping_cents,
    providerCostCents: value.provider_cost_cents,
    purchasedCostCents: value.purchased_cost_cents,
    currency: "BRL",
    recipientSnapshot: value.recipient_snapshot,
    senderSnapshot: value.sender_snapshot,
    packageSnapshot: value.package_snapshot,
    declarationItemsSnapshot: value.declaration_items_snapshot,
    providerCartId: value.provider_cart_id,
    providerShipmentId: value.provider_shipment_id,
    providerOrderId: value.provider_order_id,
    trackingCode: value.tracking_code,
    providerStatus: value.provider_status,
    lastTrackingSyncAt: value.last_tracking_sync_at,
    attentionReason: value.attention_reason,
    operationKind: operationKind as ShipmentOperationKind | null,
    operationId: operationId as string | null,
    version: value.version,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  }
  if (value.document_mode === "invoice") result.invoiceKey = invoiceKey as string
  return result
}

async function shipmentRequest(path: string): Promise<Response> {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()
  let response: Response
  try {
    response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      headers: { apikey: supabaseSecretKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    console.error("Supabase shipment request failed", { resource: "shipments", status: "network" })
    throw new Error("Shipment storage request failed")
  }
  if (!response.ok) {
    console.error("Supabase shipment request failed", { resource: "shipments", status: response.status })
    throw new Error("Shipment storage request failed")
  }
  return response
}

async function loadOne(params: URLSearchParams): Promise<ShipmentRecord | null> {
  params.set("select", SHIPMENT_SELECT)
  params.set("limit", "1")
  const response = await shipmentRequest(`shipments?${params.toString()}`)
  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload) || payload.length > 1) invalid()
  if (payload.length === 0) return null
  return parseShipment(payload[0])
}

function assertUuid(value: string) {
  if (!UUID_RE.test(value)) throw new Error("Invalid shipment identifier")
}

export async function getShipmentById(id: string): Promise<ShipmentRecord | null> {
  assertUuid(id)
  return loadOne(new URLSearchParams({ id: `eq.${id}` }))
}

export async function getActiveShipmentForOrder(orderId: string): Promise<ShipmentRecord | null> {
  assertUuid(orderId)
  return loadOne(new URLSearchParams({
    order_id: `eq.${orderId}`,
    state: "neq.canceled",
    order: "created_at.desc",
  }))
}

export async function listActiveShipmentsForTracking(limit: number): Promise<ShipmentRecord[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("Invalid shipment tracking limit")
  }
  const trackingStateFilter = "state=in.(purchased,generated,posted,in_transit)"
  const providerShipmentFilter = "provider_shipment_id=not.is.null"
  const response = await shipmentRequest(
    `shipments?select=${encodeURIComponent(SHIPMENT_SELECT)}&${trackingStateFilter}&${providerShipmentFilter}&operation_kind=is.null&order=updated_at.asc&limit=${limit}`,
  )
  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload) || payload.length > limit) invalid()
  return payload.map(parseShipment)
}
