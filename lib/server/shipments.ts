import { getSupabaseEnv } from "./env.ts"
import { maskCnpj, maskCpf } from "./shipping-sender.ts"
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
const ADMIN_SHIPMENT_EVENT_SOURCES = ["system", "admin", "melhor_envio"] as const

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

const ADMIN_SHIPMENT_SELECT = [
  "id",
  "order_id",
  "environment",
  "document_mode",
  "state",
  "service_name",
  "carrier_name",
  "customer_shipping_cents",
  "provider_cost_cents",
  "purchased_cost_cents",
  "sender_snapshot",
  "tracking_code",
  "last_tracking_sync_at",
  "attention_reason",
  "created_at",
  "updated_at",
].join(",")

const ADMIN_SHIPMENT_EVENT_KIND = {
  shipment_draft_created: "draft_created",
  shipment_prepare_claimed: "prepare_claimed",
  shipment_prepare_reverted: "prepare_reverted",
  shipment_added_to_cart: "added_to_cart",
  shipment_purchase_claimed: "purchase_claimed",
  shipment_purchased: "purchased",
  shipment_purchase_reverted: "purchase_reverted",
  shipment_attention_required: "attention_required",
  shipment_reconciled: "reconciled",
  shipment_generation_claimed: "generation_claimed",
  shipment_generated: "generated",
  shipment_cancel_claimed: "cancel_claimed",
  shipment_cancel_reverted: "cancel_reverted",
  shipment_canceled: "canceled",
  shipment_posted: "posted",
  shipment_tracking_updated: "tracking_updated",
} as const

type ShipmentOperationKind = (typeof OPERATION_KINDS)[number]
type StableShipmentState = (typeof STABLE_STATES)[number]
export type AdminShipmentHistoryKind = (typeof ADMIN_SHIPMENT_EVENT_KIND)[keyof typeof ADMIN_SHIPMENT_EVENT_KIND]
export type AdminShipmentHistorySource = (typeof ADMIN_SHIPMENT_EVENT_SOURCES)[number]

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

export interface AdminShipmentHistoryEntry {
  kind: AdminShipmentHistoryKind
  source: AdminShipmentHistorySource
  createdAt: string
}

export interface AdminShipmentProjection {
  id: string
  state: ShipmentState
  environment: ShipmentEnvironment
  documentMode: ShipmentDocumentMode
  serviceName: string
  carrierName: string
  customerShippingCents: number
  providerCostCents: number | null
  purchasedCostCents: number | null
  trackingCode: string | null
  lastTrackingSyncAt: string | null
  attentionReason: string | null
  sender: {
    personType: "pf" | "pj"
    name: string
    maskedTaxId: string
  }
  createdAt: string
  updatedAt: string
  history: AdminShipmentHistoryEntry[]
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

function parseAdminSenderSnapshot(value: unknown): AdminShipmentProjection["sender"] {
  if (!isRecord(value)) invalid()
  const personType = value.personType
  const name = value.fullName
  if ((personType !== "pf" && personType !== "pj") || !isBoundedString(name, 120)) invalid()

  if (personType === "pf") {
    if (!isBoundedString(value.cpf, 14)) invalid()
    return { personType, name, maskedTaxId: maskCpf(value.cpf) }
  }

  if (!isBoundedString(value.cnpj, 18)) invalid()
  return { personType, name, maskedTaxId: maskCnpj(value.cnpj) }
}

function parseAdminShipmentBase(value: unknown): Omit<AdminShipmentProjection, "history"> {
  if (!isRecord(value)) invalid()
  if (
    typeof value.id !== "string" || !UUID_RE.test(value.id) ||
    typeof value.order_id !== "string" || !UUID_RE.test(value.order_id) ||
    !isShipmentEnvironment(value.environment) ||
    !isShipmentDocumentMode(value.document_mode) ||
    !isShipmentState(value.state) ||
    !isBoundedString(value.service_name, 120) ||
    !isBoundedString(value.carrier_name, 120) ||
    !isNonnegativeInteger(value.customer_shipping_cents) ||
    !isNullableNonnegativeInteger(value.provider_cost_cents) ||
    !isNullableNonnegativeInteger(value.purchased_cost_cents) ||
    !isNullableBoundedString(value.tracking_code, 128) ||
    !isNullableIsoTimestamp(value.last_tracking_sync_at) ||
    !(value.attention_reason === null || isBoundedString(value.attention_reason, 64)) ||
    !isIsoTimestamp(value.created_at) ||
    !isIsoTimestamp(value.updated_at)
  ) invalid()

  return {
    id: value.id,
    state: value.state,
    environment: value.environment,
    documentMode: value.document_mode,
    serviceName: value.service_name,
    carrierName: value.carrier_name,
    customerShippingCents: value.customer_shipping_cents,
    providerCostCents: value.provider_cost_cents,
    purchasedCostCents: value.purchased_cost_cents,
    trackingCode: value.tracking_code,
    lastTrackingSyncAt: value.last_tracking_sync_at,
    attentionReason: value.attention_reason,
    sender: parseAdminSenderSnapshot(value.sender_snapshot),
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  }
}

function isAdminShipmentEventSource(value: unknown): value is AdminShipmentHistorySource {
  return typeof value === "string" && (ADMIN_SHIPMENT_EVENT_SOURCES as readonly string[]).includes(value)
}

function parseAdminShipmentHistory(value: unknown): AdminShipmentHistoryEntry[] {
  if (!Array.isArray(value) || value.length > 25) invalid()
  const result: AdminShipmentHistoryEntry[] = []
  for (const candidate of value) {
    if (!isRecord(candidate)) invalid()
    if (
      !isBoundedString(candidate.event_type, 96) ||
      !isAdminShipmentEventSource(candidate.source) ||
      !isIsoTimestamp(candidate.created_at)
    ) invalid()
    const kind = ADMIN_SHIPMENT_EVENT_KIND[
      candidate.event_type as keyof typeof ADMIN_SHIPMENT_EVENT_KIND
    ]
    if (!kind) continue
    result.push({ kind, source: candidate.source, createdAt: candidate.created_at })
  }
  return result
}

async function shipmentRequest(path: string, resource = "shipments"): Promise<Response> {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()
  let response: Response
  try {
    response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      headers: { apikey: supabaseSecretKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    console.error("Supabase shipment request failed", { resource, status: "network" })
    throw new Error("Shipment storage request failed")
  }
  if (!response.ok) {
    console.error("Supabase shipment request failed", { resource, status: response.status })
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

export async function getAdminShipmentProjectionForOrder(
  orderId: string,
): Promise<AdminShipmentProjection | null> {
  assertUuid(orderId)
  const params = new URLSearchParams({
    select: ADMIN_SHIPMENT_SELECT,
    order_id: `eq.${orderId}`,
    order: "created_at.desc,id.desc",
    limit: "1",
  })
  const response = await shipmentRequest(`shipments?${params.toString()}`)
  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload) || payload.length > 1) invalid()
  if (payload.length === 0) return null

  const shipment = parseAdminShipmentBase(payload[0])
  const eventParams = new URLSearchParams({
    select: "event_type,source,created_at",
    shipment_id: `eq.${shipment.id}`,
    order: "created_at.asc",
    limit: "25",
  })
  const eventResponse = await shipmentRequest(
    `shipment_events?${eventParams.toString()}`,
    "shipment_events",
  )
  const history = parseAdminShipmentHistory((await eventResponse.json()) as unknown)
  return { ...shipment, history }
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
