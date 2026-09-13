import {
  claimDueNotifications,
  completeNotificationAttempt,
  type ClaimedNotification,
  type NotificationCompletionResult,
} from "./notification-outbox.ts"
import { renderOrderNotification } from "./order-notification-templates.ts"
import { sendResendEmail, type ResendEmailOutcome } from "./resend-client.ts"

export interface NotificationWorkerResult {
  claimed: number
  accepted: number
  retryScheduled: number
  failed: number
}

type Claim = (input: { workerId: string; limit: number }) => Promise<ClaimedNotification[]>
type Complete = (input: {
  notificationId: string
  workerId: string
  outcome: "accepted" | "retryable" | "rejected"
  providerMessageId?: string
  errorCode?: string
}) => Promise<NotificationCompletionResult>
type Send = (input: {
  to: string
  subject: string
  text: string
  html: string
  idempotencyKey?: string
}) => Promise<ResendEmailOutcome>

function payloadMatchesClaim(row: ClaimedNotification) {
  if (!row.templatePayload || typeof row.templatePayload !== "object" || Array.isArray(row.templatePayload)) {
    return false
  }
  const payload = row.templatePayload as Record<string, unknown>
  return payload.type === row.notificationType && payload.orderId === row.orderId
}

function countCompletion(result: NotificationCompletionResult, counts: NotificationWorkerResult) {
  if (result.outcome !== "recorded") return
  if (result.status === "sent") counts.accepted += 1
  else if (result.status === "retry_scheduled") counts.retryScheduled += 1
  else if (result.status === "failed" || result.status === "bounced") counts.failed += 1
}

export async function processNotificationBatch(input: {
  workerId: string
  limit?: number
  claim?: Claim
  complete?: Complete
  send?: Send
}): Promise<NotificationWorkerResult> {
  const claim = input.claim ?? claimDueNotifications
  const complete = input.complete ?? completeNotificationAttempt
  const send = input.send ?? sendResendEmail
  const requestedLimit = input.limit ?? 25
  const limit = Math.min(Math.max(Number.isSafeInteger(requestedLimit) ? requestedLimit : 25, 1), 25)
  const rows = await claim({ workerId: input.workerId, limit })
  const counts: NotificationWorkerResult = {
    claimed: rows.length,
    accepted: 0,
    retryScheduled: 0,
    failed: 0,
  }

  for (const row of rows) {
    if (!payloadMatchesClaim(row)) {
      const result = await complete({
        notificationId: row.id,
        workerId: input.workerId,
        outcome: "rejected",
        errorCode: "invalid_notification_payload",
      })
      countCompletion(result, counts)
      continue
    }

    let rendered: ReturnType<typeof renderOrderNotification>
    try {
      rendered = renderOrderNotification(row.templatePayload)
    } catch {
      const result = await complete({
        notificationId: row.id,
        workerId: input.workerId,
        outcome: "rejected",
        errorCode: "invalid_notification_payload",
      })
      countCompletion(result, counts)
      continue
    }

    const outcome = await send({
      to: row.recipientEmail,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      idempotencyKey: row.providerIdempotencyKey,
    })

    const completion =
      outcome.outcome === "accepted"
        ? await complete({
            notificationId: row.id,
            workerId: input.workerId,
            outcome: "accepted",
            providerMessageId: outcome.messageId,
          })
        : await complete({
            notificationId: row.id,
            workerId: input.workerId,
            outcome: outcome.outcome,
            errorCode: outcome.code,
          })

    countCompletion(completion, counts)
  }

  return counts
}
