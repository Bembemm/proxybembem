import type { CheckoutOrderItem } from "./checkout-order.ts"
import { getSupabaseEnv } from "./env.ts"

export interface OrderRecord {
  id: string
  order_number: string
  public_token: string
  customer_name: string
  whatsapp: string
  cep: string
  items: CheckoutOrderItem[]
  subtotal_cents: number
  payment_provider: string
  preference_id: string | null
  payment_id: string | null
  payment_status: string
  payment_status_detail: string | null
  created_at: string
  updated_at: string
}

interface CreateOrderInput {
  orderNumber: string
  publicToken: string
  customerName: string
  whatsapp: string
  cep: string
  items: CheckoutOrderItem[]
  subtotalCents: number
}

type OrderPatch = Partial<
  Pick<
    OrderRecord,
    "preference_id" | "payment_id" | "payment_status" | "payment_status_detail"
  >
>

const ORDER_SELECT = [
  "id",
  "order_number",
  "public_token",
  "customer_name",
  "whatsapp",
  "cep",
  "items",
  "subtotal_cents",
  "payment_provider",
  "preference_id",
  "payment_id",
  "payment_status",
  "payment_status_detail",
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
    console.error("Supabase order request failed", {
      path: path.split("?")[0],
      status: response.status,
    })
    throw new Error("Order storage request failed")
  }

  return response
}

export async function createOrder(input: CreateOrderInput): Promise<OrderRecord> {
  const response = await supabaseRequest(`orders?select=${encodeURIComponent(ORDER_SELECT)}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      order_number: input.orderNumber,
      public_token: input.publicToken,
      customer_name: input.customerName,
      whatsapp: input.whatsapp,
      cep: input.cep,
      items: input.items,
      subtotal_cents: input.subtotalCents,
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
