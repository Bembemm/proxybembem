import type { CheckoutOrderItem } from "./checkout-order.ts"
import { getSupabaseEnv } from "./env.ts"
import {
  isFulfillmentStatus,
  type FulfillmentStatus,
} from "./fulfillment.ts"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PAYMENT_FILTER_RE = /^[a-z][a-z0-9_]{0,99}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_QUERY_LENGTH = 100
const MAX_PAGE_SIZE = 50
const MAX_OFFSET = 10_000

export type AdminOrderAttentionSeverity = "info" | "warning" | "critical"
export type AdminOrderSort = "newest" | "oldest"

export interface AdminOrderListRow {
  id: string
  order_number: string
  customer_name: string
  whatsapp: string
  subtotal_cents: number
  total_cents: number | null
  payment_status: string
  fulfillment_status: FulfillmentStatus
  created_at: string
  updated_at: string
  open_attention_count: number
  open_attention_severity: AdminOrderAttentionSeverity | null
}

export interface AdminOrderDetail {
  id: string
  order_number: string
  customer_name: string
  customer_email: string | null
  whatsapp: string
  cep: string
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_neighborhood: string | null
  address_city: string | null
  address_state: string | null
  items: CheckoutOrderItem[]
  subtotal_cents: number
  shipping_provider: string | null
  shipping_service_id: string | null
  shipping_service_name: string | null
  shipping_carrier_name: string | null
  shipping_delivery_days: number | null
  shipping_cents: number | null
  shipping_snapshot: unknown | null
  total_cents: number | null
  payment_provider: string
  preference_id: string | null
  payment_id: string | null
  payment_status: string
  payment_status_detail: string | null
  fulfillment_status: FulfillmentStatus
  created_at: string
  updated_at: string
}

export interface ListAdminOrdersInput {
  query?: string
  paymentStatus?: string
  fulfillmentStatus?: string
  attentionRequired?: boolean
  from?: string
  to?: string
  sort?: AdminOrderSort
  page?: number
  pageSize?: number
}

export interface AdminOrderListResult {
  orders: AdminOrderListRow[]
  total: number
  page: number
  pageSize: number
}

const ADMIN_ORDER_DETAIL_SELECT = [
  "id",
  "order_number",
  "customer_name",
  "customer_email",
  "whatsapp",
  "cep",
  "address_street",
  "address_number",
  "address_complement",
  "address_neighborhood",
  "address_city",
  "address_state",
  "items",
  "subtotal_cents",
  "shipping_provider",
  "shipping_service_id",
  "shipping_service_name",
  "shipping_carrier_name",
  "shipping_delivery_days",
  "shipping_cents",
  "shipping_snapshot",
  "total_cents",
  "payment_provider",
  "preference_id",
  "payment_id",
  "payment_status",
  "payment_status_detail",
  "fulfillment_status",
  "created_at",
  "updated_at",
].join(",")

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function isNonEmptyBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max
}

function isNullableNonnegativeSafeInteger(value: unknown): value is number | null {
  return value === null || isNonnegativeSafeInteger(value)
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function isIsoLikeTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value))
}

function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const [yearText, monthText, dayText] = value.split("-")
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const timestamp = Date.UTC(year, month - 1, day)
  const date = new Date(timestamp)
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function assertCanonicalUuid(value: string) {
  if (!UUID_RE.test(value)) throw new Error("Invalid admin order id")
}

function assertCheckoutItem(value: unknown): asserts value is CheckoutOrderItem {
  if (!isRecord(value) || !isRecord(value.shipping)) {
    throw new Error("Admin order storage returned an invalid response")
  }

  if (
    !isPositiveSafeInteger(value.productId) ||
    !isNonEmptyBoundedString(value.title, 500) ||
    !isPositiveSafeInteger(value.unitPriceCents) ||
    !isPositiveSafeInteger(value.quantity) ||
    !isPositiveFiniteNumber(value.shipping.weightKg) ||
    !isPositiveFiniteNumber(value.shipping.lengthCm) ||
    !isPositiveFiniteNumber(value.shipping.widthCm) ||
    !isPositiveFiniteNumber(value.shipping.heightCm)
  ) {
    throw new Error("Admin order storage returned an invalid response")
  }
}

function parseListRow(value: unknown): AdminOrderListRow {
  if (!isRecord(value)) {
    throw new Error("Admin order storage returned an invalid response")
  }

  const severity = value.open_attention_severity
  if (
    typeof value.id !== "string" ||
    !UUID_RE.test(value.id) ||
    !isNonEmptyBoundedString(value.order_number, 100) ||
    !isNonEmptyBoundedString(value.customer_name, 500) ||
    !isNonEmptyBoundedString(value.whatsapp, 100) ||
    !isNonnegativeSafeInteger(value.subtotal_cents) ||
    !isNullableNonnegativeSafeInteger(value.total_cents) ||
    !isNonEmptyBoundedString(value.payment_status, 100) ||
    !isFulfillmentStatus(value.fulfillment_status) ||
    !isIsoLikeTimestamp(value.created_at) ||
    !isIsoLikeTimestamp(value.updated_at) ||
    !isNonnegativeSafeInteger(value.open_attention_count) ||
    !(
      severity === null ||
      severity === "info" ||
      severity === "warning" ||
      severity === "critical"
    )
  ) {
    throw new Error("Admin order storage returned an invalid response")
  }

  return value as unknown as AdminOrderListRow
}

function parseDetailRow(value: unknown): AdminOrderDetail {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("Admin order storage returned an invalid response")
  }

  for (const item of value.items) assertCheckoutItem(item)

  if (
    typeof value.id !== "string" ||
    !UUID_RE.test(value.id) ||
    !isNonEmptyBoundedString(value.order_number, 100) ||
    !isNonEmptyBoundedString(value.customer_name, 500) ||
    !isNullableString(value.customer_email) ||
    !isNonEmptyBoundedString(value.whatsapp, 100) ||
    !isNonEmptyBoundedString(value.cep, 20) ||
    !isNullableString(value.address_street) ||
    !isNullableString(value.address_number) ||
    !isNullableString(value.address_complement) ||
    !isNullableString(value.address_neighborhood) ||
    !isNullableString(value.address_city) ||
    !isNullableString(value.address_state) ||
    !isNonnegativeSafeInteger(value.subtotal_cents) ||
    !isNullableString(value.shipping_provider) ||
    !isNullableString(value.shipping_service_id) ||
    !isNullableString(value.shipping_service_name) ||
    !isNullableString(value.shipping_carrier_name) ||
    !isNullableNonnegativeSafeInteger(value.shipping_delivery_days) ||
    !isNullableNonnegativeSafeInteger(value.shipping_cents) ||
    !("shipping_snapshot" in value) ||
    !isNullableNonnegativeSafeInteger(value.total_cents) ||
    !isNonEmptyBoundedString(value.payment_provider, 100) ||
    !isNullableString(value.preference_id) ||
    !isNullableString(value.payment_id) ||
    !isNonEmptyBoundedString(value.payment_status, 100) ||
    !isNullableString(value.payment_status_detail) ||
    !isFulfillmentStatus(value.fulfillment_status) ||
    !isIsoLikeTimestamp(value.created_at) ||
    !isIsoLikeTimestamp(value.updated_at)
  ) {
    throw new Error("Admin order storage returned an invalid response")
  }

  return value as unknown as AdminOrderDetail
}

async function adminOrderRequest(path: string, init?: RequestInit) {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()

  let response: Response
  try {
    response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: supabaseSecretKey,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    console.error("Supabase admin order request failed", {
      operation: init?.method ?? "GET",
      resource: path.split("?")[0],
      status: "network",
    })
    throw new Error("Admin order storage request failed")
  }

  if (!response.ok) {
    console.error("Supabase admin order request failed", {
      operation: init?.method ?? "GET",
      resource: path.split("?")[0],
      status: response.status,
    })
    throw new Error("Admin order storage request failed")
  }

  return response
}

function normalizeListInput(input: ListAdminOrdersInput) {
  const page = input.page ?? 1
  const pageSize = input.pageSize ?? 25
  const sort = input.sort ?? "newest"

  if (!Number.isSafeInteger(page) || page < 1) {
    throw new Error("Invalid admin order page")
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error("Invalid admin order page size")
  }

  const offset = (page - 1) * pageSize
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    throw new Error("Invalid admin order page")
  }

  const query = input.query?.trim() ?? ""
  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error("Invalid admin order query")
  }

  const paymentStatus = input.paymentStatus?.trim() ?? ""
  if (paymentStatus && !PAYMENT_FILTER_RE.test(paymentStatus)) {
    throw new Error("Invalid admin payment status filter")
  }

  if (
    input.fulfillmentStatus !== undefined &&
    !isFulfillmentStatus(input.fulfillmentStatus)
  ) {
    throw new Error("Invalid admin fulfillment status filter")
  }

  if (
    input.attentionRequired !== undefined &&
    typeof input.attentionRequired !== "boolean"
  ) {
    throw new Error("Invalid admin attention filter")
  }

  if (input.from !== undefined && !isCalendarDate(input.from)) {
    throw new Error("Invalid admin order from date")
  }
  if (input.to !== undefined && !isCalendarDate(input.to)) {
    throw new Error("Invalid admin order to date")
  }
  if (input.from !== undefined && input.to !== undefined && input.from > input.to) {
    throw new Error("Invalid admin order date range")
  }

  if (sort !== "newest" && sort !== "oldest") {
    throw new Error("Invalid admin order sort")
  }

  return {
    page,
    pageSize,
    body: {
      p_query: query || null,
      p_payment_status: paymentStatus || null,
      p_fulfillment_status: input.fulfillmentStatus ?? null,
      p_attention_required: input.attentionRequired ?? null,
      p_from_date: input.from ?? null,
      p_to_date: input.to ?? null,
      p_sort: sort,
      p_limit: pageSize,
      p_offset: offset,
    },
  }
}

export async function listAdminOrders(
  input: ListAdminOrdersInput = {},
): Promise<AdminOrderListResult> {
  const normalized = normalizeListInput(input)
  const response = await adminOrderRequest("rpc/admin_list_orders", {
    method: "POST",
    body: JSON.stringify(normalized.body),
  })

  const payload = (await response.json()) as unknown
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.orders) ||
    !isNonnegativeSafeInteger(payload.total)
  ) {
    throw new Error("Admin order storage returned an invalid response")
  }

  const orders = payload.orders.map(parseListRow)
  return {
    orders,
    total: payload.total,
    page: normalized.page,
    pageSize: normalized.pageSize,
  }
}

export async function getAdminOrderById(
  orderId: string,
): Promise<AdminOrderDetail | null> {
  assertCanonicalUuid(orderId)

  const params = new URLSearchParams({
    id: `eq.${orderId}`,
    select: ADMIN_ORDER_DETAIL_SELECT,
    limit: "1",
  })

  const response = await adminOrderRequest(`orders?${params.toString()}`)
  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload)) {
    throw new Error("Admin order storage returned an invalid response")
  }
  if (payload.length === 0) return null
  if (payload.length !== 1) {
    throw new Error("Admin order storage returned an invalid response")
  }

  return parseDetailRow(payload[0])
}
