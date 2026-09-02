import type { CheckoutOrderItem } from "./checkout-order.ts"
import { getSupabaseEnv } from "./env.ts"
import {
  isFulfillmentStatus,
  type FulfillmentStatus,
} from "./fulfillment.ts"

export interface OrderRecord {
  id: string
  order_number: string
  public_token: string
  customer_name: string
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
  total_cents: number | null
  shipping_snapshot: unknown | null
  checkout_attempt_id: string | null
  checkout_fingerprint: string | null
  checkout_url: string | null
  payment_provider: string
  preference_id: string | null
  payment_id: string | null
  payment_status: string
  payment_status_detail: string | null
  fulfillment_status: FulfillmentStatus
  created_at: string
  updated_at: string
}

export interface CreateOrderInput {
  orderNumber: string
  publicToken: string
  customerName: string
  whatsapp: string
  cep: string
  items: CheckoutOrderItem[]
  subtotalCents: number
  address?: {
    street: string
    number: string
    complement: string
    neighborhood: string
    city: string
    state: string
  }
  shipping?: {
    provider: string
    serviceId: string
    serviceName: string
    carrierName: string
    deliveryDays: number
    amountCents: number
    snapshot: unknown
  }
  totalCents?: number
  checkoutAttemptId?: string
  checkoutFingerprint?: string
}

export interface PaymentEventResult {
  outcome: "updated" | "ignored" | "manual_review" | "not_found"
  order_number: string | null
  payment_status: string | null
  payment_id: string | null
  expected_cents: number | null
  received_cents: number
  fulfillment_status: FulfillmentStatus | null
  fulfillment_transitioned: boolean
}

export class OrderConflictError extends Error {
  readonly code: "checkout_attempt_conflict"

  constructor(code: "checkout_attempt_conflict") {
    super(code)
    this.name = "OrderConflictError"
    this.code = code
  }
}

type OrderPatch = Partial<
  Pick<
    OrderRecord,
    | "preference_id"
    | "payment_id"
    | "payment_status"
    | "payment_status_detail"
    | "checkout_url"
  >
>

const ORDER_SELECT = [
  "id",
  "order_number",
  "public_token",
  "customer_name",
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
  "total_cents",
  "shipping_snapshot",
  "checkout_attempt_id",
  "checkout_fingerprint",
  "checkout_url",
  "payment_provider",
  "preference_id",
  "payment_id",
  "payment_status",
  "payment_status_detail",
  "fulfillment_status",
  "created_at",
  "updated_at",
].join(",")

async function supabaseRequest(path: string, init?: RequestInit) {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
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

  if (!response.ok) {
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      // Ignore malformed storage error bodies.
    }

    const storageError =
      payload && typeof payload === "object"
        ? (payload as { code?: unknown; message?: unknown })
        : null
    if (
      response.status === 409 &&
      storageError?.code === "23505" &&
      typeof storageError.message === "string" &&
      storageError.message.includes("orders_checkout_attempt_id_uidx")
    ) {
      throw new OrderConflictError("checkout_attempt_conflict")
    }

    console.error("Supabase order request failed", {
      path: path.split("?")[0],
      status: response.status,
    })
    throw new Error("Order storage request failed")
  }

  return response
}

export async function createOrder(input: CreateOrderInput): Promise<OrderRecord> {
  const addressFields = input.address
    ? {
        address_street: input.address.street,
        address_number: input.address.number,
        address_complement: input.address.complement,
        address_neighborhood: input.address.neighborhood,
        address_city: input.address.city,
        address_state: input.address.state,
      }
    : {}

  const shippingFields = input.shipping
    ? {
        shipping_provider: input.shipping.provider,
        shipping_service_id: input.shipping.serviceId,
        shipping_service_name: input.shipping.serviceName,
        shipping_carrier_name: input.shipping.carrierName,
        shipping_delivery_days: input.shipping.deliveryDays,
        shipping_cents: input.shipping.amountCents,
        shipping_snapshot: input.shipping.snapshot,
      }
    : {}

  const response = await supabaseRequest(`orders?select=${encodeURIComponent(ORDER_SELECT)}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      order_number: input.orderNumber,
      public_token: input.publicToken,
      customer_name: input.customerName,
      whatsapp: input.whatsapp,
      cep: input.cep,
      ...addressFields,
      items: input.items,
      subtotal_cents: input.subtotalCents,
      ...shippingFields,
      ...(input.totalCents !== undefined ? { total_cents: input.totalCents } : {}),
      ...(input.checkoutAttemptId
        ? { checkout_attempt_id: input.checkoutAttemptId }
        : {}),
      ...(input.checkoutFingerprint
        ? { checkout_fingerprint: input.checkoutFingerprint }
        : {}),
      payment_provider: "mercadopago",
      payment_status: "pending",
    }),
  })

  const rows = (await response.json()) as OrderRecord[]
  if (!Array.isArray(rows) || !rows[0]) {
    throw new Error("Order storage returned no order")
  }
  return rows[0]
}

export async function updateOrderByNumber(
  orderNumber: string,
  patch: OrderPatch,
): Promise<OrderRecord | null> {
  const params = new URLSearchParams({
    order_number: `eq.${orderNumber}`,
    select: ORDER_SELECT,
  })

  const response = await supabaseRequest(`orders?${params.toString()}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  })

  const rows = (await response.json()) as OrderRecord[]
  return rows[0] ?? null
}

export async function getOrderByNumber(orderNumber: string): Promise<OrderRecord | null> {
  const params = new URLSearchParams({
    order_number: `eq.${orderNumber}`,
    select: ORDER_SELECT,
    limit: "1",
  })
  const response = await supabaseRequest(`orders?${params.toString()}`)
  const rows = (await response.json()) as OrderRecord[]
  return rows[0] ?? null
}

export async function getOrderByCheckoutAttemptId(
  attemptId: string,
): Promise<OrderRecord | null> {
  const params = new URLSearchParams({
    checkout_attempt_id: `eq.${attemptId}`,
    select: ORDER_SELECT,
    limit: "1",
  })
  const response = await supabaseRequest(`orders?${params.toString()}`)
  const rows = (await response.json()) as OrderRecord[]
  return rows[0] ?? null
}

export async function getOrderByPublicToken(publicToken: string): Promise<OrderRecord | null> {
  if (!/^[a-f0-9]{64}$/i.test(publicToken)) return null

  const params = new URLSearchParams({
    public_token: `eq.${publicToken}`,
    select: ORDER_SELECT,
    limit: "1",
  })
  const response = await supabaseRequest(`orders?${params.toString()}`)
  const rows = (await response.json()) as OrderRecord[]
  return rows[0] ?? null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function isNullableSafeInteger(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value))
}

export async function applyMercadoPagoPaymentEvent(input: {
  orderNumber: string
  paymentId: string
  incomingStatus: string
  statusDetail: string | null
  paidCents: number
  currencyId: string
}): Promise<PaymentEventResult> {
  if (
    !/^PB-[A-F0-9]{12}$/.test(input.orderNumber) ||
    !/^\d{1,32}$/.test(input.paymentId) ||
    !input.incomingStatus ||
    input.incomingStatus.length > 100 ||
    (input.statusDetail !== null && input.statusDetail.length > 200) ||
    !Number.isSafeInteger(input.paidCents) ||
    input.paidCents < 0 ||
    !/^[A-Z]{3}$/.test(input.currencyId)
  ) {
    throw new Error("Invalid payment event input")
  }

  const response = await supabaseRequest("rpc/apply_mercadopago_payment_event", {
    method: "POST",
    body: JSON.stringify({
      p_order_number: input.orderNumber,
      p_payment_id: input.paymentId,
      p_incoming_status: input.incomingStatus,
      p_status_detail: input.statusDetail,
      p_paid_cents: input.paidCents,
      p_currency_id: input.currencyId,
    }),
  })

  const payload = (await response.json()) as unknown
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Payment event RPC returned an invalid response")
  }

  const result = payload as Partial<PaymentEventResult>
  const fulfillmentStatus = result.fulfillment_status
  if (
    !["updated", "ignored", "manual_review", "not_found"].includes(
      String(result.outcome),
    ) ||
    !isNullableString(result.order_number) ||
    !isNullableString(result.payment_status) ||
    !isNullableString(result.payment_id) ||
    !isNullableSafeInteger(result.expected_cents) ||
    typeof result.received_cents !== "number" ||
    !Number.isSafeInteger(result.received_cents) ||
    (fulfillmentStatus !== null && !isFulfillmentStatus(fulfillmentStatus)) ||
    typeof result.fulfillment_transitioned !== "boolean"
  ) {
    throw new Error("Payment event RPC returned an invalid response")
  }

  return result as PaymentEventResult
}
