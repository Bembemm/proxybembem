import { getSupabaseEnv } from "./env.ts"
import { assertSafeMetadata } from "./safe-metadata.ts"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CODE_RE = /^[a-z][a-z0-9_]{2,63}$/

export const ORDER_EVENT_SOURCES = [
  "system",
  "mercadopago",
  "admin",
  "shipment",
  "notification",
  "customer",
] as const

export type OrderEventSource = (typeof ORDER_EVENT_SOURCES)[number]

const SOURCE_SET = new Set<string>(ORDER_EVENT_SOURCES)
const EVENT_SELECT =
  "id,order_id,event_type,source,dedupe_key,metadata,created_at"

export interface OrderEventRecord {
  id: string
  order_id: string
  event_type: string
  source: OrderEventSource
  dedupe_key: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface AppendOrderEventInput {
  orderId: string
  eventType: string
  source: OrderEventSource
  dedupeKey?: string
  metadata?: Record<string, unknown>
}

function assertUuid(value: string) {
  if (!UUID_RE.test(value)) throw new Error("invalid order id")
}

function assertCode(value: string, label: string) {
  if (!CODE_RE.test(value)) throw new Error(`invalid ${label}`)
}

function assertSource(value: unknown): asserts value is OrderEventSource {
  if (typeof value !== "string" || !SOURCE_SET.has(value)) {
    throw new Error("invalid event source")
  }
}

function assertLimit(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("invalid event limit")
  }
}

async function eventRequest(path: string, init?: RequestInit) {
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
    console.error("Supabase order event request failed", {
      operation: init?.method ?? "GET",
      table: "order_events",
      status: "network",
    })
    throw new Error("Order event storage request failed")
  }

  if (!response.ok) {
    console.error("Supabase order event request failed", {
      operation: init?.method ?? "GET",
      table: "order_events",
      status: response.status,
    })
    throw new Error("Order event storage request failed")
  }

  return response
}

export async function appendOrderEvent(
  input: AppendOrderEventInput,
): Promise<OrderEventRecord | null> {
  assertUuid(input.orderId)
  assertCode(input.eventType, "event type")
  assertSource(input.source)

  if (
    input.dedupeKey !== undefined &&
    (input.dedupeKey.length < 1 || input.dedupeKey.length > 200)
  ) {
    throw new Error("invalid event dedupe key")
  }

  const metadata = input.metadata ?? {}
  assertSafeMetadata(metadata, "metadata")

  const params = new URLSearchParams({ select: EVENT_SELECT })
  const prefer = input.dedupeKey
    ? "resolution=ignore-duplicates,return=representation"
    : "return=representation"

  if (input.dedupeKey) {
    params.set("on_conflict", "dedupe_key")
  }

  const response = await eventRequest(`order_events?${params.toString()}`, {
    method: "POST",
    headers: { Prefer: prefer },
    body: JSON.stringify({
      order_id: input.orderId,
      event_type: input.eventType,
      source: input.source,
      dedupe_key: input.dedupeKey ?? null,
      metadata,
    }),
  })

  const rows = (await response.json()) as unknown
  if (!Array.isArray(rows)) {
    throw new Error("Order event storage returned an invalid response")
  }
  if (rows.length === 0 && input.dedupeKey) return null
  if (!rows[0] || typeof rows[0] !== "object") {
    throw new Error("Order event storage returned no event")
  }

  return rows[0] as OrderEventRecord
}

export async function listOrderEvents(
  orderId: string,
  limit = 100,
): Promise<OrderEventRecord[]> {
  assertUuid(orderId)
  assertLimit(limit)

  const params = new URLSearchParams({
    order_id: `eq.${orderId}`,
    select: EVENT_SELECT,
    order: "created_at.desc",
    limit: String(limit),
  })

  const response = await eventRequest(`order_events?${params.toString()}`)
  const rows = (await response.json()) as unknown
  if (!Array.isArray(rows)) {
    throw new Error("Order event storage returned an invalid response")
  }
  return rows as OrderEventRecord[]
}
