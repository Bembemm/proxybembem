import { getSupabaseEnv } from "./env.ts"
import {
  ORDER_NOTIFICATION_TYPES,
  type OrderNotificationType,
} from "./order-notification-templates.ts"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const STATUSES = [
  "pending",
  "processing",
  "sent",
  "delivered",
  "retry_scheduled",
  "failed",
  "bounced",
] as const
const RESEND_OUTCOMES = ["created", "not_found", "not_ready", "conflict"] as const

export type AdminNotificationStatus = (typeof STATUSES)[number]
export type AdminNotificationResendOutcome = (typeof RESEND_OUTCOMES)[number]

export const ADMIN_NOTIFICATION_STATUS_LABELS: Record<AdminNotificationStatus, string> = {
  pending: "Pendente",
  processing: "Enviando",
  sent: "Enviado",
  delivered: "Entregue",
  retry_scheduled: "Aguardando nova tentativa",
  failed: "Falhou",
  bounced: "Rejeitado/Bounce",
}

export const ADMIN_NOTIFICATION_TYPE_LABELS: Record<OrderNotificationType, string> = {
  payment_approved: "Pagamento aprovado",
  production_started: "Produção iniciada",
  ready_to_ship: "Pronto para envio",
  shipped: "Pedido enviado",
  delivered: "Pedido entregue",
  canceled: "Pedido cancelado",
  refunded: "Reembolso concluído",
  charged_back: "Pagamento revertido",
}

export interface AdminOrderNotification {
  id: string
  notificationType: OrderNotificationType
  recipientEmail: string
  status: AdminNotificationStatus
  attemptCount: number
  lastErrorCode: string | null
  resendOfId: string | null
  lastAttemptedAt: string | null
  sentAt: string | null
  deliveredAt: string | null
  bouncedAt: string | null
  failedAt: string | null
  createdAt: string
}

export interface AdminNotificationResendResult {
  outcome: AdminNotificationResendOutcome
  notificationId: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value)
}

function isType(value: unknown): value is OrderNotificationType {
  return typeof value === "string" && (ORDER_NOTIFICATION_TYPES as readonly string[]).includes(value)
}

function isStatus(value: unknown): value is AdminNotificationStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value)
}

function isNullableText(value: unknown, max: number): value is string | null {
  return value === null || (typeof value === "string" && value.length >= 1 && value.length <= max)
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value)
}

function parseRow(value: unknown): AdminOrderNotification {
  if (!isRecord(value)) throw new Error("Admin notification history failed")
  if (
    !isUuid(value.id) ||
    !isType(value.notification_type) ||
    typeof value.recipient_email !== "string" ||
    value.recipient_email.length > 320 ||
    !EMAIL_RE.test(value.recipient_email) ||
    !isStatus(value.status) ||
    typeof value.attempt_count !== "number" ||
    !Number.isSafeInteger(value.attempt_count) ||
    value.attempt_count < 0 ||
    value.attempt_count > 3 ||
    !isNullableText(value.last_error_code, 120) ||
    !(value.resend_of_id === null || isUuid(value.resend_of_id)) ||
    !isNullableTimestamp(value.last_attempted_at) ||
    !isNullableTimestamp(value.sent_at) ||
    !isNullableTimestamp(value.delivered_at) ||
    !isNullableTimestamp(value.bounced_at) ||
    !isNullableTimestamp(value.failed_at) ||
    !isTimestamp(value.created_at)
  ) {
    throw new Error("Admin notification history failed")
  }

  return {
    id: value.id,
    notificationType: value.notification_type,
    recipientEmail: value.recipient_email,
    status: value.status,
    attemptCount: value.attempt_count,
    lastErrorCode: value.last_error_code,
    resendOfId: value.resend_of_id,
    lastAttemptedAt: value.last_attempted_at,
    sentAt: value.sent_at,
    deliveredAt: value.delivered_at,
    bouncedAt: value.bounced_at,
    failedAt: value.failed_at,
    createdAt: value.created_at,
  }
}

async function rpc(name: string, body: Record<string, unknown>) {
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
    console.error("Supabase admin notification request failed", { operation: name, status: "network" })
    throw new Error("Admin notification history failed")
  }
  if (!response.ok) {
    console.error("Supabase admin notification request failed", { operation: name, status: response.status })
    throw new Error("Admin notification history failed")
  }
  try {
    return await response.json()
  } catch {
    throw new Error("Admin notification history failed")
  }
}

export async function listAdminOrderNotifications(orderId: string): Promise<AdminOrderNotification[]> {
  if (!UUID_RE.test(orderId)) throw new Error("Invalid admin order id")
  const value = await rpc("admin_list_order_notifications", { p_order_id: orderId })
  if (!Array.isArray(value) || value.length > 500) throw new Error("Admin notification history failed")
  return value.map(parseRow)
}

export async function resendAdminOrderNotification(input: {
  orderId: string
  notificationId: string
  adminUserId: string
}): Promise<AdminNotificationResendResult> {
  if (!UUID_RE.test(input.orderId) || !UUID_RE.test(input.notificationId) || !UUID_RE.test(input.adminUserId)) {
    throw new Error("Invalid admin notification resend input")
  }

  const value = await rpc("admin_resend_order_notification", {
    p_order_id: input.orderId,
    p_notification_id: input.notificationId,
    p_admin_user_id: input.adminUserId,
  })
  if (!isRecord(value) || !(RESEND_OUTCOMES as readonly string[]).includes(String(value.outcome))) {
    throw new Error("Admin notification history failed")
  }
  if (value.outcome === "not_found") {
    if (value.notification_id !== null) throw new Error("Admin notification history failed")
    return { outcome: "not_found", notificationId: null }
  }
  if (!isUuid(value.notification_id)) throw new Error("Admin notification history failed")
  return {
    outcome: value.outcome as AdminNotificationResendOutcome,
    notificationId: value.notification_id,
  }
}
