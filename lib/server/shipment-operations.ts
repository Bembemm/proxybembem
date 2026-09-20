import { getSupabaseEnv } from "./env.ts"
import { isShipmentEnvironment, isShipmentState, type ShipmentState } from "../shipments/shipment.ts"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INVOICE_KEY_RE = /^\d{44}$/
const ATTENTION_REASONS = ["cart_outcome_unknown"] as const
const OUTCOMES = ["created", "transitioned", "not_found", "conflict", "invalid_state", "operation_mismatch", "active_exists"] as const

type ShipmentOutcome = (typeof OUTCOMES)[number]
type AttentionReason = (typeof ATTENTION_REASONS)[number]

export interface ShipmentOperationResult {
  outcome: ShipmentOutcome
  shipmentId: string | null
  orderId: string | null
  previousState: ShipmentState | null
  state: ShipmentState | null
  version: number | null
}

type CommonMutation = {
  shipmentId: string
  adminUserId: string
  expectedVersion: number
  operationId: string
}

type CreateDraftInput = {
  orderId: string
  adminUserId: string
  senderProfileId: string
  senderProfileVersion: number
  environment: "sandbox" | "production"
  documentMode?: "declaration_content" | "invoice"
  invoiceKey?: string | null
  serviceId: string
  serviceName: string
  carrierName: string
  customerShippingCents: number
  recipientSnapshot: Record<string, unknown>
  senderSnapshot: Record<string, unknown>
  packageSnapshot: Record<string, unknown>
  declarationItemsSnapshot: unknown[]
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

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max
}

function isOneOf<T extends readonly string[]>(value: unknown, choices: T): value is T[number] {
  return typeof value === "string" && (choices as readonly string[]).includes(value)
}

function assertUuid(value: unknown, label = "identifier"): asserts value is string {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error(`Invalid shipment ${label}`)
}

function assertCommon(input: Record<string, unknown>) {
  assertUuid(input.shipmentId)
  assertUuid(input.adminUserId, "administrator")
  assertUuid(input.operationId, "operation")
  if (!isPositiveInteger(input.expectedVersion)) throw new Error("Invalid shipment version")
}

function parseResult(value: unknown): ShipmentOperationResult {
  if (!isRecord(value) || !isOneOf(value.outcome, OUTCOMES)) {
    throw new Error("Shipment operation failed")
  }
  if (value.outcome === "not_found") {
    if (
      value.shipment_id !== null || value.order_id !== null || value.previous_state !== null ||
      value.state !== null || value.version !== null
    ) throw new Error("Shipment operation failed")
    return { outcome: "not_found", shipmentId: null, orderId: null, previousState: null, state: null, version: null }
  }
  if (
    typeof value.shipment_id !== "string" || !UUID_RE.test(value.shipment_id) ||
    typeof value.order_id !== "string" || !UUID_RE.test(value.order_id) ||
    !(value.previous_state === null || isShipmentState(value.previous_state)) ||
    !isShipmentState(value.state) ||
    !isPositiveInteger(value.version)
  ) throw new Error("Shipment operation failed")
  return {
    outcome: value.outcome,
    shipmentId: value.shipment_id,
    orderId: value.order_id,
    previousState: value.previous_state,
    state: value.state,
    version: value.version,
  }
}

async function callRpc(rpc: string, body: Record<string, unknown>): Promise<ShipmentOperationResult> {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()
  let response: Response
  try {
    response = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpc}`, {
      method: "POST",
      headers: {
        apikey: supabaseSecretKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    console.error("Supabase shipment operation failed", { operation: rpc, status: "network" })
    throw new Error("Shipment operation failed")
  }
  if (!response.ok) {
    console.error("Supabase shipment operation failed", { operation: rpc, status: response.status })
    throw new Error("Shipment operation failed")
  }
  try {
    return parseResult((await response.json()) as unknown)
  } catch (error) {
    if (error instanceof Error && error.message === "Shipment operation failed") throw error
    throw new Error("Shipment operation failed")
  }
}

export async function createShipmentDraft(input: CreateDraftInput): Promise<ShipmentOperationResult> {
  assertUuid(input.orderId, "order")
  assertUuid(input.adminUserId, "administrator")
  assertUuid(input.senderProfileId, "sender")
  if (!isPositiveInteger(input.senderProfileVersion)) throw new Error("Invalid shipment sender version")
  if (!isShipmentEnvironment(input.environment)) throw new Error("Invalid shipment environment")
  if (!isBoundedString(input.serviceId, 64) || !isBoundedString(input.serviceName, 120) || !isBoundedString(input.carrierName, 120)) {
    throw new Error("Invalid shipment service")
  }
  if (!isNonnegativeInteger(input.customerShippingCents)) throw new Error("Invalid shipment cost")
  if (!isRecord(input.recipientSnapshot) || !isRecord(input.senderSnapshot) || !isRecord(input.packageSnapshot)) {
    throw new Error("Invalid shipment snapshot")
  }
  if (!Array.isArray(input.declarationItemsSnapshot) || input.declarationItemsSnapshot.length < 1) {
    throw new Error("Invalid shipment declaration")
  }
  const documentMode = input.documentMode ?? "declaration_content"
  if (documentMode !== "declaration_content" && documentMode !== "invoice") throw new Error("Invalid shipment document mode")
  if (documentMode === "invoice") {
    if (typeof input.invoiceKey !== "string" || !INVOICE_KEY_RE.test(input.invoiceKey)) throw new Error("Invalid shipment invoice key")
  } else if (!(input.invoiceKey === undefined || input.invoiceKey === null)) {
    throw new Error("Invalid shipment invoice key")
  }

  const body: Record<string, unknown> = {
    p_order_id: input.orderId,
    p_admin_user_id: input.adminUserId,
    p_sender_profile_id: input.senderProfileId,
    p_sender_profile_version: input.senderProfileVersion,
    p_environment: input.environment,
    p_service_id: input.serviceId,
    p_service_name: input.serviceName,
    p_carrier_name: input.carrierName,
    p_customer_shipping_cents: input.customerShippingCents,
    p_recipient_snapshot: input.recipientSnapshot,
    p_sender_snapshot: input.senderSnapshot,
    p_package_snapshot: input.packageSnapshot,
    p_declaration_items_snapshot: input.declarationItemsSnapshot,
  }
  if (documentMode === "invoice") {
    body.p_document_mode = "invoice"
    body.p_invoice_key = input.invoiceKey
  }
  return callRpc("admin_create_shipment_draft", body)
}

function commonBody(input: Record<string, unknown>) {
  assertCommon(input)
  return {
    p_shipment_id: input.shipmentId,
    p_admin_user_id: input.adminUserId,
    p_expected_version: input.expectedVersion,
    p_operation_id: input.operationId,
  }
}

export async function claimShipmentPrepare(input: CommonMutation) {
  return callRpc("admin_claim_shipment_prepare", commonBody(input))
}

export async function commitShipmentCart(input: CommonMutation & { providerCartId: string; providerShipmentId: string; providerCostCents: number }) {
  const body = commonBody(input)
  assertUuid(input.providerCartId, "provider cart")
  assertUuid(input.providerShipmentId, "provider shipment")
  if (!isNonnegativeInteger(input.providerCostCents)) throw new Error("Invalid shipment cost")
  return callRpc("admin_commit_shipment_cart", {
    ...body,
    p_provider_cart_id: input.providerCartId,
    p_provider_shipment_id: input.providerShipmentId,
    p_provider_cost_cents: input.providerCostCents,
  })
}

export async function revertShipmentPrepare(input: CommonMutation) {
  return callRpc("admin_revert_shipment_prepare", commonBody(input))
}

export async function markShipmentAttention(input: CommonMutation & { reason: AttentionReason }) {
  const body = commonBody(input)
  if (!isOneOf(input.reason, ATTENTION_REASONS)) throw new Error("Invalid shipment attention reason")
  return callRpc("admin_mark_shipment_attention", { ...body, p_reason: input.reason })
}

