import { getSupabaseEnv } from "./env.ts"
import { isOrderNotificationType, type OrderNotificationType } from "./order-notification-templates.ts"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OUTBOX_STATUSES = [
  "pending",
  "processing",
  "sent",
  "delivered",
  "retry_scheduled",
  "failed",
  "bounced",
] as const
const COMPLETION_OUTCOMES = ["recorded", "not_found", "conflict"] as const

export type NotificationOutboxStatus = (typeof OUTBOX_STATUSES)[number]
export type NotificationCompletionOutcome = (typeof COMPLETION_OUTCOMES)[number]

export interface ClaimedNotification {
  id: string
  orderId: string
  notificationType: OrderNotificationType
  recipientEmail: string
  templatePayload: unknown
  providerIdempotencyKey: string
  attemptCount: number
}

export interface NotificationCompletionResult {
  outcome: NotificationCompletionOutcome
  notificationId: string | null
  status: NotificationOutboxStatus | null
  attemptCount: number | null
}

type CompletionInput = {
  notificationId: string
  workerId: string
  outcome: "accepted" | "retryable" | "rejected"
  providerMessageId?: string
  errorCode?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value)
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value)
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max
}

function parseClaimedRow(value: unknown): ClaimedNotification {
  if (!isRecord(value)) throw new Error("Notification outbox request failed")
  if (
    !isUuid(value.id) ||
    !isUuid(value.order_id) ||
    !isOrderNotificationType(value.notification_type) ||
    typeof value.recipient_email !== "string" ||
    value.recipient_email.length > 320 ||
    !EMAIL_RE.test(value.recipient_email) ||
    !boundedText(value.provider_idempotency_key, 255) ||
    typeof value.attempt_count !== "number" ||
    !Number.isSafeInteger(value.attempt_count) ||
    value.attempt_count < 0 ||
    value.attempt_count > 2 ||
    !isRecord(value.template_payload)
  ) {
    throw new Error("Notification outbox request failed")
  }

  return {
    id: value.id,
    orderId: value.order_id,
    notificationType: value.notification_type,
    recipientEmail: value.recipient_email,
    templatePayload: value.template_payload,
    providerIdempotencyKey: value.provider_idempotency_key,
    attemptCount: value.attempt_count,
  }
}

function parseCompletion(value: unknown): NotificationCompletionResult {
  if (!isRecord(value) || !isOneOf(value.outcome, COMPLETION_OUTCOMES)) {
    throw new Error("Notification outbox request failed")
  }

  if (value.outcome === "not_found") {
    if (value.notification_id !== null || value.status !== null || value.attempt_count !== null) {
      throw new Error("Notification outbox request failed")
    }
    return { outcome: "not_found", notificationId: null, status: null, attemptCount: null }
  }

  if (
    !isUuid(value.notification_id) ||
    !isOneOf(value.status, OUTBOX_STATUSES) ||
    typeof value.attempt_count !== "number" ||
    !Number.isSafeInteger(value.attempt_count) ||
    value.attempt_count < 0 ||
    value.attempt_count > 3
  ) {
    throw new Error("Notification outbox request failed")
  }

  return {
    outcome: value.outcome,
    notificationId: value.notification_id,
    status: value.status,
    attemptCount: value.attempt_count,
  }
}

async function rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()
  let response: Response
  try {
    response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
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
    console.error("Supabase notification outbox request failed", { operation: name, status: "network" })
    throw new Error("Notification outbox request failed")
  }

  if (!response.ok) {
    console.error("Supabase notification outbox request failed", { operation: name, status: response.status })
    throw new Error("Notification outbox request failed")
  }

  try {
    return await response.json()
  } catch {
    throw new Error("Notification outbox request failed")
  }
}

export async function claimDueNotifications(input: {
  workerId: string
  limit: number
}): Promise<ClaimedNotification[]> {
  if (!isUuid(input.workerId) || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 25) {
    throw new Error("Invalid notification claim input")
  }

  const value = await rpc("claim_due_notification_outbox", {
    p_limit: input.limit,
    p_worker_id: input.workerId,
    p_lease_seconds: 120,
  })
  if (!Array.isArray(value) || value.length > 25) {
    throw new Error("Notification outbox request failed")
  }
  return value.map(parseClaimedRow)
}

export async function completeNotificationAttempt(
  input: CompletionInput,
): Promise<NotificationCompletionResult> {
  if (!isUuid(input.notificationId) || !isUuid(input.workerId)) {
    throw new Error("Invalid notification completion input")
  }
  if (
    input.providerMessageId !== undefined &&
    !boundedText(input.providerMessageId, 128)
  ) {
    throw new Error("Invalid notification completion input")
  }
  if (input.errorCode !== undefined && !boundedText(input.errorCode, 120)) {
    throw new Error("Invalid notification completion input")
  }
  if (input.outcome === "accepted" && !input.providerMessageId) {
    throw new Error("Invalid notification completion input")
  }
  if (input.outcome !== "accepted" && input.providerMessageId !== undefined) {
    throw new Error("Invalid notification completion input")
  }

  const value = await rpc("complete_notification_attempt", {
    p_notification_id: input.notificationId,
    p_worker_id: input.workerId,
    p_outcome: input.outcome,
    p_provider_message_id: input.providerMessageId ?? null,
    p_error_code: input.errorCode ?? null,
  })
  return parseCompletion(value)
}
