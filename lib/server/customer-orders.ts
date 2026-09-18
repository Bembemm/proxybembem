import {
  isFulfillmentStatus,
  type FulfillmentStatus,
} from "./fulfillment.ts"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NIL_UUID = "00000000-0000-0000-0000-000000000000"
const ORDER_NUMBER_PATTERN = /^PB-[A-F0-9]{12}$/
const PAYMENT_STATUS_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TIMELINE_KINDS = new Set([
  "payment_approved",
  "payment_reversed",
  "production_started",
  "ready_to_ship",
  "shipped",
  "completed",
  "canceled",
])
const CUSTOMER_SHIPMENT_STATUSES = new Set([
  "preparing",
  "posted",
  "in_transit",
  "delivered",
  "canceled",
  "attention",
])
const CUSTOMER_SHIPMENT_TIMELINE_KINDS = new Set([
  "posted",
  "in_transit",
  "delivered",
])

export interface CustomerOrderSummary {
  id: string
  orderNumber: string
  subtotalCents: number
  totalCents: number | null
  paymentStatus: string
  fulfillmentStatus: FulfillmentStatus
  createdAt: string
  shippingServiceName: string | null
  shippingCarrierName: string | null
  shippingDeliveryDays: number | null
}

export interface CustomerOrderItem {
  productId: number
  title: string
  unitPriceCents: number
  quantity: number
}

export interface CustomerOrderTimelineEntry {
  kind:
    | "payment_approved"
    | "payment_reversed"
    | "production_started"
    | "ready_to_ship"
    | "shipped"
    | "completed"
    | "canceled"
  createdAt: string
}

export type CustomerShipmentStatus =
  | "preparing"
  | "posted"
  | "in_transit"
  | "delivered"
  | "canceled"
  | "attention"

export interface CustomerShipmentTimelineEntry {
  kind: "posted" | "in_transit" | "delivered"
  createdAt: string
}

export interface CustomerShipmentProjection {
  carrierName: string
  serviceName: string
  trackingCode: string | null
  status: CustomerShipmentStatus
  updatedAt: string
  timeline: CustomerShipmentTimelineEntry[]
}

export interface CustomerOrderDetail {
  id: string
  orderNumber: string
  items: CustomerOrderItem[]
  subtotalCents: number
  shippingCents: number | null
  totalCents: number | null
  paymentStatus: string
  fulfillmentStatus: FulfillmentStatus
  createdAt: string
  updatedAt: string
  shippingServiceName: string | null
  shippingCarrierName: string | null
  shippingDeliveryDays: number | null
  customerName: string
  whatsapp: string
  customerEmail: string | null
  address: {
    street: string | null
    number: string | null
    complement: string | null
    neighborhood: string | null
    city: string | null
    state: string | null
  }
  timeline: CustomerOrderTimelineEntry[]
  shipment: CustomerShipmentProjection | null
}

export interface CustomerOrderDependencies {
  listOrders(input: { limit: number; offset: number }): Promise<unknown>
  getOrder(orderId: string): Promise<unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function requireExactKeys(
  value: unknown,
  keys: readonly string[],
  message: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(message)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(message)
  }
  return value
}

function parseCanonicalUuid(value: unknown, message: string) {
  if (
    typeof value !== "string" ||
    !UUID_PATTERN.test(value) ||
    value.toLowerCase() === NIL_UUID
  ) {
    throw new Error(message)
  }
  return value.toLowerCase()
}

function parseOrderNumber(value: unknown, message: string) {
  if (typeof value !== "string" || !ORDER_NUMBER_PATTERN.test(value)) {
    throw new Error(message)
  }
  return value
}

function parseCents(value: unknown, nullable: boolean, message: string) {
  if (nullable && value === null) return null
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(message)
  }
  return value
}

function parsePositiveCents(value: unknown, message: string) {
  const parsed = parseCents(value, false, message)
  if (parsed === null || parsed <= 0) throw new Error(message)
  return parsed
}

function parseTimestamp(value: unknown, message: string) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(message)
  }
  return value
}

function parseOptionalText(
  value: unknown,
  maxLength: number,
  message: string,
): string | null {
  if (value === null) return null
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(message)
  }
  return value
}

function parseRequiredText(value: unknown, maxLength: number, message: string) {
  const parsed = parseOptionalText(value, maxLength, message)
  if (parsed === null) throw new Error(message)
  return parsed
}

function parseOptionalAddressText(
  value: unknown,
  maxLength: number,
  message: string,
): string | null {
  if (value === "") return null
  return parseOptionalText(value, maxLength, message)
}

function parsePaymentStatus(value: unknown, message: string) {
  if (typeof value !== "string" || !PAYMENT_STATUS_PATTERN.test(value)) {
    throw new Error(message)
  }
  return value
}

function parseDeliveryDays(value: unknown, message: string) {
  if (value === null) return null
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 365
  ) {
    throw new Error(message)
  }
  return value
}

function parseSummary(value: unknown): CustomerOrderSummary {
  const message = "Customer order list returned an invalid response"
  const row = requireExactKeys(
    value,
    [
      "id",
      "order_number",
      "subtotal_cents",
      "total_cents",
      "payment_status",
      "fulfillment_status",
      "created_at",
      "shipping_service_name",
      "shipping_carrier_name",
      "shipping_delivery_days",
    ],
    message,
  )

  if (!isFulfillmentStatus(row.fulfillment_status)) throw new Error(message)

  return {
    id: parseCanonicalUuid(row.id, message),
    orderNumber: parseOrderNumber(row.order_number, message),
    subtotalCents: parsePositiveCents(row.subtotal_cents, message),
    totalCents: parseCents(row.total_cents, true, message),
    paymentStatus: parsePaymentStatus(row.payment_status, message),
    fulfillmentStatus: row.fulfillment_status,
    createdAt: parseTimestamp(row.created_at, message),
    shippingServiceName: parseOptionalText(row.shipping_service_name, 120, message),
    shippingCarrierName: parseOptionalText(row.shipping_carrier_name, 120, message),
    shippingDeliveryDays: parseDeliveryDays(row.shipping_delivery_days, message),
  }
}

function parseShippingSnapshot(value: unknown, message: string) {
  const shipping = requireExactKeys(
    value,
    ["weightKg", "lengthCm", "widthCm", "heightCm"],
    message,
  )
  for (const key of ["weightKg", "lengthCm", "widthCm", "heightCm"] as const) {
    const candidate = shipping[key]
    if (
      typeof candidate !== "number" ||
      !Number.isFinite(candidate) ||
      candidate <= 0 ||
      candidate > 10000
    ) {
      throw new Error(message)
    }
  }
}

function parseItem(value: unknown): CustomerOrderItem {
  const message = "Customer order detail returned an invalid response"
  const item = requireExactKeys(
    value,
    ["productId", "title", "unitPriceCents", "quantity", "shipping"],
    message,
  )

  if (
    typeof item.productId !== "number" ||
    !Number.isSafeInteger(item.productId) ||
    item.productId <= 0 ||
    typeof item.quantity !== "number" ||
    !Number.isSafeInteger(item.quantity) ||
    item.quantity < 1 ||
    item.quantity > 100
  ) {
    throw new Error(message)
  }
  parseShippingSnapshot(item.shipping, message)

  return {
    productId: item.productId,
    title: parseRequiredText(item.title, 200, message),
    unitPriceCents: parsePositiveCents(item.unitPriceCents, message),
    quantity: item.quantity,
  }
}

function parseTimeline(value: unknown): CustomerOrderTimelineEntry[] {
  const message = "Customer order detail returned an invalid response"
  if (!Array.isArray(value) || value.length > 100) throw new Error(message)

  return value.map((candidate) => {
    const row = requireExactKeys(candidate, ["kind", "created_at"], message)
    if (typeof row.kind !== "string" || !TIMELINE_KINDS.has(row.kind)) {
      throw new Error(message)
    }
    return {
      kind: row.kind as CustomerOrderTimelineEntry["kind"],
      createdAt: parseTimestamp(row.created_at, message),
    }
  })
}

function parseCustomerShipment(value: unknown): CustomerShipmentProjection | null {
  const message = "Customer order detail returned an invalid response"
  if (value === null) return null
  const row = requireExactKeys(
    value,
    ["carrier_name", "service_name", "tracking_code", "status", "updated_at", "timeline"],
    message,
  )
  if (
    typeof row.status !== "string" ||
    !CUSTOMER_SHIPMENT_STATUSES.has(row.status) ||
    !Array.isArray(row.timeline) ||
    row.timeline.length > 3
  ) {
    throw new Error(message)
  }

  const seen = new Set<string>()
  let previousTimestamp = Number.NEGATIVE_INFINITY
  const timeline = row.timeline.map((candidate) => {
    const entry = requireExactKeys(candidate, ["kind", "created_at"], message)
    if (
      typeof entry.kind !== "string" ||
      !CUSTOMER_SHIPMENT_TIMELINE_KINDS.has(entry.kind) ||
      seen.has(entry.kind)
    ) {
      throw new Error(message)
    }
    const createdAt = parseTimestamp(entry.created_at, message)
    const timestamp = Date.parse(createdAt)
    if (timestamp < previousTimestamp) throw new Error(message)
    previousTimestamp = timestamp
    seen.add(entry.kind)
    return {
      kind: entry.kind as CustomerShipmentTimelineEntry["kind"],
      createdAt,
    }
  })

  return {
    carrierName: parseRequiredText(row.carrier_name, 120, message),
    serviceName: parseRequiredText(row.service_name, 120, message),
    trackingCode: parseOptionalText(row.tracking_code, 128, message),
    status: row.status as CustomerShipmentStatus,
    updatedAt: parseTimestamp(row.updated_at, message),
    timeline,
  }
}

function parseEmail(value: unknown, message: string) {
  if (value === null) return null
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 254 ||
    value !== value.trim().toLowerCase() ||
    !EMAIL_PATTERN.test(value)
  ) {
    throw new Error(message)
  }
  return value
}

function parseAddressState(value: unknown, message: string) {
  if (value === null) return null
  if (typeof value !== "string" || !/^[A-Z]{2}$/.test(value)) {
    throw new Error(message)
  }
  return value
}

function parseDetail(value: unknown): CustomerOrderDetail {
  const message = "Customer order detail returned an invalid response"
  const row = requireExactKeys(
    value,
    [
      "id",
      "order_number",
      "items",
      "subtotal_cents",
      "shipping_cents",
      "total_cents",
      "payment_status",
      "fulfillment_status",
      "created_at",
      "updated_at",
      "shipping_service_name",
      "shipping_carrier_name",
      "shipping_delivery_days",
      "customer_name",
      "whatsapp",
      "customer_email",
      "address_street",
      "address_number",
      "address_complement",
      "address_neighborhood",
      "address_city",
      "address_state",
      "timeline",
      "shipment",
    ],
    message,
  )

  if (!Array.isArray(row.items) || row.items.length < 1 || row.items.length > 100) {
    throw new Error(message)
  }
  if (!isFulfillmentStatus(row.fulfillment_status)) throw new Error(message)
  if (typeof row.whatsapp !== "string" || !/^\d{10,11}$/.test(row.whatsapp)) {
    throw new Error(message)
  }

  return {
    id: parseCanonicalUuid(row.id, message),
    orderNumber: parseOrderNumber(row.order_number, message),
    items: row.items.map(parseItem),
    subtotalCents: parsePositiveCents(row.subtotal_cents, message),
    shippingCents: parseCents(row.shipping_cents, true, message),
    totalCents: parseCents(row.total_cents, true, message),
    paymentStatus: parsePaymentStatus(row.payment_status, message),
    fulfillmentStatus: row.fulfillment_status,
    createdAt: parseTimestamp(row.created_at, message),
    updatedAt: parseTimestamp(row.updated_at, message),
    shippingServiceName: parseOptionalText(row.shipping_service_name, 120, message),
    shippingCarrierName: parseOptionalText(row.shipping_carrier_name, 120, message),
    shippingDeliveryDays: parseDeliveryDays(row.shipping_delivery_days, message),
    customerName: parseRequiredText(row.customer_name, 100, message),
    whatsapp: row.whatsapp,
    customerEmail: parseEmail(row.customer_email, message),
    address: {
      street: parseOptionalText(row.address_street, 120, message),
      number: parseOptionalText(row.address_number, 20, message),
      complement: parseOptionalAddressText(row.address_complement, 80, message),
      neighborhood: parseOptionalText(row.address_neighborhood, 80, message),
      city: parseOptionalText(row.address_city, 80, message),
      state: parseAddressState(row.address_state, message),
    },
    timeline: parseTimeline(row.timeline),
    shipment: parseCustomerShipment(row.shipment),
  }
}

function normalizePagination(input?: { page?: number; pageSize?: number }) {
  const page = input?.page ?? 1
  const pageSize = input?.pageSize ?? 25
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 50
  ) {
    throw new Error("Invalid customer order pagination")
  }
  const offset = (page - 1) * pageSize
  if (!Number.isSafeInteger(offset) || offset > 10000) {
    throw new Error("Invalid customer order pagination")
  }
  return { page, pageSize, offset }
}

export async function listOwnOrdersWithDependencies(
  input: { page?: number; pageSize?: number } | undefined,
  deps: CustomerOrderDependencies,
): Promise<{
  orders: CustomerOrderSummary[]
  total: number
  page: number
  pageSize: number
}> {
  const pagination = normalizePagination(input)
  const raw = await deps.listOrders({
    limit: pagination.pageSize,
    offset: pagination.offset,
  })
  const message = "Customer order list returned an invalid response"
  const payload = requireExactKeys(raw, ["orders", "total"], message)
  if (
    !Array.isArray(payload.orders) ||
    payload.orders.length > pagination.pageSize ||
    typeof payload.total !== "number" ||
    !Number.isSafeInteger(payload.total) ||
    payload.total < 0 ||
    payload.total < payload.orders.length
  ) {
    throw new Error(message)
  }

  return {
    orders: payload.orders.map(parseSummary),
    total: payload.total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  }
}

export async function getOwnOrderByIdWithDependencies(
  orderId: string,
  deps: CustomerOrderDependencies,
): Promise<CustomerOrderDetail | null> {
  const normalizedOrderId = parseCanonicalUuid(
    orderId,
    "Invalid customer order id",
  )
  const raw = await deps.getOrder(normalizedOrderId)
  if (raw === null) return null
  return parseDetail(raw)
}

async function createProductionDependencies(): Promise<CustomerOrderDependencies> {
  const { createSupabaseServerClient } = await import("../supabase/server.ts")
  const supabase = await createSupabaseServerClient()

  return {
    async listOrders(input) {
      const { data, error } = await supabase.rpc("customer_list_orders", {
        p_limit: input.limit,
        p_offset: input.offset,
      })
      if (error) throw new Error("Customer order storage request failed")
      return data
    },
    async getOrder(orderId) {
      const { data, error } = await supabase.rpc("customer_get_order", {
        p_order_id: orderId,
      })
      if (error) throw new Error("Customer order storage request failed")
      return data
    },
  }
}

export async function listOwnOrders(input?: {
  page?: number
  pageSize?: number
}) {
  return listOwnOrdersWithDependencies(input, await createProductionDependencies())
}

export async function getOwnOrderById(orderId: string) {
  return getOwnOrderByIdWithDependencies(orderId, await createProductionDependencies())
}
