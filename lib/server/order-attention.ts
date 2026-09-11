import { getSupabaseEnv } from "./env.ts"
import type { OrderEventSource } from "./order-events.ts"
import { assertSafeMetadata } from "./safe-metadata.ts"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CODE_RE = /^[a-z][a-z0-9_]{2,63}$/
const SOURCE_SET = new Set<string>([
  "system",
  "mercadopago",
  "admin",
  "shipment",
  "notification",
  "customer",
])
const SEVERITY_SET = new Set<string>(["info", "warning", "critical"])
const ATTENTION_SELECT =
  "id,order_id,code,severity,source,metadata,opened_at,resolved_at"

export type AttentionSeverity = "info" | "warning" | "critical"

export interface OrderAttentionRecord {
  id: string
  order_id: string
  code: string
  severity: AttentionSeverity
  source: OrderEventSource
  metadata: Record<string, unknown>
  opened_at: string
  resolved_at: string | null
}

function assertUuid(value: string) {
  if (!UUID_RE.test(value)) throw new Error("invalid order id")
}

function assertCode(value: string) {
  if (!CODE_RE.test(value)) throw new Error("invalid attention code")
}

function assertSeverity(value: unknown): asserts value is AttentionSeverity {
  if (typeof value !== "string" || !SEVERITY_SET.has(value)) {
    throw new Error("invalid attention severity")
  }
}

function assertSource(value: unknown): asserts value is OrderEventSource {
  if (typeof value !== "string" || !SOURCE_SET.has(value)) {
    throw new Error("invalid attention source")
  }
}

async function attentionFetch(path: string, init?: RequestInit) {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()
  try {
    return await fetch(`${supabaseUrl}/rest/v1/${path}`, {
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
    console.error("Supabase order attention request failed", {
      operation: init?.method ?? "GET",
      table: "order_attention_flags",
      status: "network",
    })
    throw new Error("Order attention storage request failed")
  }
}

function logStorageFailure(init: RequestInit | undefined, status: number) {
  console.error("Supabase order attention request failed", {
    operation: init?.method ?? "GET",
    table: "order_attention_flags",
    status,
  })
}

export async function openOrderAttention(input: {
  orderId: string
  code: string
  severity: AttentionSeverity
  source: OrderEventSource
  metadata?: Record<string, unknown>
}): Promise<OrderAttentionRecord | null> {
  assertUuid(input.orderId)
  assertCode(input.code)
  assertSeverity(input.severity)
  assertSource(input.source)

  const metadata = input.metadata ?? {}
  assertSafeMetadata(metadata, "metadata")

  const params = new URLSearchParams({ select: ATTENTION_SELECT })
  const init: RequestInit = {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      order_id: input.orderId,
      code: input.code,
      severity: input.severity,
      source: input.source,
      metadata,
    }),
  }
  const response = await attentionFetch(
    `order_attention_flags?${params.toString()}`,
    init,
  )

  if (!response.ok) {
    if (response.status === 409) {
      let payload: unknown = null
      try {
        payload = await response.json()
      } catch {
        // A malformed conflict body is treated as an ordinary storage failure.
      }
      const error =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as { code?: unknown; message?: unknown })
          : null
      if (
        error?.code === "23505" &&
        typeof error.message === "string" &&
        error.message.includes("order_attention_active_code_uidx")
      ) {
        return null
      }
    }

    logStorageFailure(init, response.status)
    throw new Error("Order attention storage request failed")
  }

  const rows = (await response.json()) as unknown
  if (!Array.isArray(rows) || !rows[0] || typeof rows[0] !== "object") {
    throw new Error("Order attention storage returned no attention row")
  }
  return rows[0] as OrderAttentionRecord
}

export async function resolveOrderAttention(input: {
  orderId: string
  code: string
}): Promise<OrderAttentionRecord | null> {
  assertUuid(input.orderId)
  assertCode(input.code)

  const params = new URLSearchParams({
    order_id: `eq.${input.orderId}`,
    code: `eq.${input.code}`,
    resolved_at: "is.null",
    select: ATTENTION_SELECT,
  })
  const init: RequestInit = {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ resolved_at: new Date().toISOString() }),
  }
  const response = await attentionFetch(
    `order_attention_flags?${params.toString()}`,
    init,
  )

  if (!response.ok) {
    logStorageFailure(init, response.status)
    throw new Error("Order attention storage request failed")
  }

  const rows = (await response.json()) as unknown
  if (!Array.isArray(rows)) {
    throw new Error("Order attention storage returned an invalid response")
  }
  return (rows[0] as OrderAttentionRecord | undefined) ?? null
}

export async function listOpenOrderAttention(
  orderId: string,
): Promise<OrderAttentionRecord[]> {
  assertUuid(orderId)

  const params = new URLSearchParams({
    order_id: `eq.${orderId}`,
    resolved_at: "is.null",
    select: ATTENTION_SELECT,
    order: "opened_at.desc",
  })
  const response = await attentionFetch(
    `order_attention_flags?${params.toString()}`,
  )

  if (!response.ok) {
    logStorageFailure(undefined, response.status)
    throw new Error("Order attention storage request failed")
  }

  const rows = (await response.json()) as unknown
  if (!Array.isArray(rows)) {
    throw new Error("Order attention storage returned an invalid response")
  }
  return rows as OrderAttentionRecord[]
}
