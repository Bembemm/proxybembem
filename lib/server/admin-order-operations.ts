import { getSupabaseEnv } from "./env.ts"
import {
  isFulfillmentStatus,
  type FulfillmentStatus,
} from "./fulfillment.ts"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ORDER_NUMBER_RE = /^PB-[A-F0-9]{12}$/

export const ADMIN_FULFILLMENT_TARGETS = [
  "in_production",
  "ready_to_ship",
  "shipped",
  "completed",
  "canceled",
] as const satisfies readonly FulfillmentStatus[]

export type AdminFulfillmentTarget = (typeof ADMIN_FULFILLMENT_TARGETS)[number]

export type AdminFulfillmentOutcome =
  | "transitioned"
  | "unchanged"
  | "not_found"
  | "invalid_transition"
  | "payment_precondition_failed"

export interface AdminFulfillmentResult {
  outcome: AdminFulfillmentOutcome
  order_id: string | null
  order_number: string | null
  payment_status: string | null
  previous_fulfillment_status: FulfillmentStatus | null
  fulfillment_status: FulfillmentStatus | null
}

export interface TransitionAdminOrderFulfillmentInput {
  orderId: string
  adminUserId: string
  targetStatus: AdminFulfillmentTarget
}

const TARGET_SET = new Set<string>(ADMIN_FULFILLMENT_TARGETS)
const OUTCOME_SET = new Set<string>([
  "transitioned",
  "unchanged",
  "not_found",
  "invalid_transition",
  "payment_precondition_failed",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && UUID_RE.test(value))
}

function isNullableOrderNumber(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && ORDER_NUMBER_RE.test(value))
}

function isNullablePaymentStatus(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length > 0 && value.length <= 100)
}

function isNullableFulfillmentStatus(value: unknown): value is FulfillmentStatus | null {
  return value === null || isFulfillmentStatus(value)
}

function assertUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) throw new Error(`Invalid ${label}`)
}

function assertTarget(value: unknown): asserts value is AdminFulfillmentTarget {
  if (typeof value !== "string" || !TARGET_SET.has(value)) {
    throw new Error("Invalid admin fulfillment target")
  }
}

function parseResult(value: unknown): AdminFulfillmentResult {
  if (!isRecord(value)) {
    throw new Error("Admin fulfillment RPC returned an invalid response")
  }

  if (
    typeof value.outcome !== "string" ||
    !OUTCOME_SET.has(value.outcome) ||
    !isNullableUuid(value.order_id) ||
    !isNullableOrderNumber(value.order_number) ||
    !isNullablePaymentStatus(value.payment_status) ||
    !isNullableFulfillmentStatus(value.previous_fulfillment_status) ||
    !isNullableFulfillmentStatus(value.fulfillment_status)
  ) {
    throw new Error("Admin fulfillment RPC returned an invalid response")
  }

  if (value.outcome === "not_found") {
    if (
      value.order_id !== null ||
      value.order_number !== null ||
      value.payment_status !== null ||
      value.previous_fulfillment_status !== null ||
      value.fulfillment_status !== null
    ) {
      throw new Error("Admin fulfillment RPC returned an invalid response")
    }
  } else if (
    value.order_id === null ||
    value.order_number === null ||
    value.payment_status === null ||
    value.previous_fulfillment_status === null ||
    value.fulfillment_status === null
  ) {
    throw new Error("Admin fulfillment RPC returned an invalid response")
  }

  return value as unknown as AdminFulfillmentResult
}

async function operationRequest(init: RequestInit) {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()
  let response: Response

  try {
    response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/admin_transition_order_fulfillment`,
      {
        ...init,
        headers: {
          apikey: supabaseSecretKey,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...init.headers,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    )
  } catch {
    console.error("Supabase admin order operation failed", {
      operation: "admin_transition_order_fulfillment",
      status: "network",
    })
    throw new Error("Admin order operation failed")
  }

  if (!response.ok) {
    console.error("Supabase admin order operation failed", {
      operation: "admin_transition_order_fulfillment",
      status: response.status,
    })
    throw new Error("Admin order operation failed")
  }

  return response
}

export async function transitionAdminOrderFulfillment(
  input: TransitionAdminOrderFulfillmentInput,
): Promise<AdminFulfillmentResult> {
  assertUuid(input.orderId, "admin order id")
  assertUuid(input.adminUserId, "admin user id")
  assertTarget(input.targetStatus)

  const response = await operationRequest({
    method: "POST",
    body: JSON.stringify({
      p_order_id: input.orderId,
      p_admin_user_id: input.adminUserId,
      p_target_status: input.targetStatus,
    }),
  })

  return parseResult((await response.json()) as unknown)
}
