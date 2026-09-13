import { createHmac, timingSafeEqual } from "node:crypto"
import { getSupabaseEnv } from "./env.ts"

const WEBHOOK_TOLERANCE_SECONDS = 300
const WEBHOOK_MAX_BYTES = 65_536
const OPERATIONAL_EVENT_TYPES = [
  "email.sent",
  "email.delivered",
  "email.bounced",
  "email.failed",
  "email.suppressed",
] as const
const OUTBOX_STATUSES = [
  "pending",
  "processing",
  "sent",
  "delivered",
  "retry_scheduled",
  "failed",
  "bounced",
] as const

type OperationalEventType = (typeof OPERATIONAL_EVENT_TYPES)[number]
type OutboxStatus = (typeof OUTBOX_STATUSES)[number]

class WebhookBodyTooLargeError extends Error {
  constructor() {
    super("Webhook body too large")
    this.name = "WebhookBodyTooLargeError"
  }
}

export interface ResendWebhookRecordResult {
  outcome: "recorded" | "duplicate"
  matched: boolean
  status: OutboxStatus | null
}

export interface ResendWebhookRecordInput {
  svixId: string
  eventType: OperationalEventType
  providerMessageId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isOperationalEventType(value: unknown): value is OperationalEventType {
  return typeof value === "string" && (OPERATIONAL_EVENT_TYPES as readonly string[]).includes(value)
}

function boundedText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maxLength &&
    !/[\u0000-\u001f\u007f]/.test(value)
  )
}

async function readBoundedRawBody(request: Request) {
  const contentLengthHeader = request.headers.get("content-length")
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)
    if (Number.isFinite(contentLength) && contentLength > WEBHOOK_MAX_BYTES) {
      throw new WebhookBodyTooLargeError()
    }
  }

  if (!request.body) return ""

  const reader = request.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > WEBHOOK_MAX_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new WebhookBodyTooLargeError()
      }
      chunks.push(Buffer.from(value))
    }
  } catch (error) {
    if (error instanceof WebhookBodyTooLargeError) throw error
    throw new Error("Invalid webhook body")
  }

  return Buffer.concat(chunks, total).toString("utf8")
}

function decodeSigningSecret(secret: string) {
  if (!secret.startsWith("whsec_")) return null
  const encoded = secret.slice("whsec_".length)
  if (!encoded) return null
  try {
    const decoded = Buffer.from(encoded, "base64")
    return decoded.length >= 16 ? decoded : null
  } catch {
    return null
  }
}

function candidateSignatures(header: string): Uint8Array[] {
  const candidates: Uint8Array[] = []
  for (const part of header.split(/\s+/)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const separator = trimmed.indexOf(",")
    if (separator < 1) continue
    const version = trimmed.slice(0, separator)
    const encoded = trimmed.slice(separator + 1)
    if (version !== "v1" || !encoded) continue
    try {
      candidates.push(Buffer.from(encoded, "base64"))
    } catch {
      // Ignore malformed signature candidates and continue checking the header.
    }
  }
  return candidates
}

export function verifyResendWebhook(input: {
  rawBody: string
  id: string | null
  timestamp: string | null
  signature: string | null
  secret: string
  now?: number
}) {
  if (
    !boundedText(input.id, 128) ||
    !boundedText(input.timestamp, 32) ||
    !boundedText(input.signature, 4096)
  ) {
    return false
  }

  const timestamp = Number(input.timestamp)
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return false
  const now = input.now ?? Math.floor(Date.now() / 1000)
  if (!Number.isFinite(now) || Math.abs(now - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    return false
  }

  const key = decodeSigningSecret(input.secret)
  if (!key) return false

  const expected = createHmac("sha256", key)
    .update(`${input.id}.${input.timestamp}.${input.rawBody}`)
    .digest()

  for (const candidate of candidateSignatures(input.signature)) {
    if (candidate.byteLength === expected.byteLength && timingSafeEqual(candidate, expected)) {
      return true
    }
  }
  return false
}

function parseRecordResult(value: unknown): ResendWebhookRecordResult {
  if (!isRecord(value) || (value.outcome !== "recorded" && value.outcome !== "duplicate")) {
    throw new Error("Notification webhook persistence failed")
  }
  if (typeof value.matched !== "boolean") {
    throw new Error("Notification webhook persistence failed")
  }
  if (
    value.status !== null &&
    !(typeof value.status === "string" && (OUTBOX_STATUSES as readonly string[]).includes(value.status))
  ) {
    throw new Error("Notification webhook persistence failed")
  }
  return {
    outcome: value.outcome,
    matched: value.matched,
    status: value.status as OutboxStatus | null,
  }
}

export async function recordResendWebhookEvent(
  input: ResendWebhookRecordInput,
): Promise<ResendWebhookRecordResult> {
  if (
    !boundedText(input.svixId, 128) ||
    !isOperationalEventType(input.eventType) ||
    !boundedText(input.providerMessageId, 128)
  ) {
    throw new Error("Invalid notification webhook input")
  }

  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()
  let response: Response
  try {
    response = await fetch(`${supabaseUrl}/rest/v1/rpc/record_notification_webhook`, {
      method: "POST",
      headers: {
        apikey: supabaseSecretKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_svix_id: input.svixId,
        p_event_type: input.eventType,
        p_provider_message_id: input.providerMessageId,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    console.error("Notification webhook persistence failed", { status: "network" })
    throw new Error("Notification webhook persistence failed")
  }

  if (!response.ok) {
    console.error("Notification webhook persistence failed", { status: response.status })
    throw new Error("Notification webhook persistence failed")
  }

  try {
    return parseRecordResult(await response.json())
  } catch (error) {
    if (error instanceof Error && error.message === "Notification webhook persistence failed") {
      throw error
    }
    throw new Error("Notification webhook persistence failed")
  }
}

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export function createResendWebhookHandler(deps: {
  getSecret(): string
  record(input: ResendWebhookRecordInput): Promise<ResendWebhookRecordResult>
  now?: () => number
}) {
  return async function handleResendWebhook(request: Request) {
    let rawBody: string
    try {
      rawBody = await readBoundedRawBody(request)
    } catch (error) {
      if (error instanceof WebhookBodyTooLargeError) {
        return json({ ok: false }, 413)
      }
      return json({ ok: false }, 400)
    }

    let secret: string
    try {
      secret = deps.getSecret()
    } catch {
      return json({ ok: false }, 401)
    }

    const svixId = request.headers.get("svix-id")
    const svixTimestamp = request.headers.get("svix-timestamp")
    const svixSignature = request.headers.get("svix-signature")
    if (!verifyResendWebhook({
      rawBody,
      id: svixId,
      timestamp: svixTimestamp,
      signature: svixSignature,
      secret,
      now: deps.now?.(),
    })) {
      return json({ ok: false }, 401)
    }

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return json({ ok: false }, 400)
    }
    if (!isRecord(body) || typeof body.type !== "string") {
      return json({ ok: false }, 400)
    }

    if (!isOperationalEventType(body.type)) {
      return json({ ok: true }, 200)
    }
    if (!isRecord(body.data) || !boundedText(body.data.email_id, 128) || !boundedText(svixId, 128)) {
      return json({ ok: false }, 400)
    }

    try {
      await deps.record({
        svixId,
        eventType: body.type,
        providerMessageId: body.data.email_id,
      })
      return json({ ok: true }, 200)
    } catch {
      return json({ ok: false }, 503)
    }
  }
}
