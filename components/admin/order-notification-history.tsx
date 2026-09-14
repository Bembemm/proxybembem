import {
  ADMIN_NOTIFICATION_STATUS_LABELS,
  ADMIN_NOTIFICATION_TYPE_LABELS,
  type AdminOrderNotification,
} from "../../lib/server/admin-order-notifications.ts"

const RESENDABLE_STATUSES = new Set(["sent", "delivered", "failed", "bounced"])

function formatLocalDate(value: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function latestStatusAt(notification: AdminOrderNotification) {
  if (notification.status === "delivered") return notification.deliveredAt
  if (notification.status === "bounced") return notification.bouncedAt
  if (notification.status === "failed") return notification.failedAt
  if (notification.status === "sent") return notification.sentAt
  return notification.lastAttemptedAt ?? notification.createdAt
}

export function OrderNotificationHistory({
  orderId,
  notifications,
}: {
  orderId: string
  notifications: AdminOrderNotification[]
}) {
  if (notifications.length === 0) {
    return <p className="text-sm text-slate-500">Nenhum e-mail transacional registrado.</p>
  }

  return (
    <ol className="grid gap-3">
      {notifications.map((notification) => (
        <li key={notification.id} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {ADMIN_NOTIFICATION_TYPE_LABELS[notification.notificationType]}
                </p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {ADMIN_NOTIFICATION_STATUS_LABELS[notification.status]}
                </span>
                <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
                  {notification.resendOfId ? "Reenvio manual" : "Automático"}
                </span>
              </div>
              <p className="mt-1 break-all text-xs text-slate-500">{notification.recipientEmail}</p>
              <p className="mt-1 text-xs text-slate-500">
                Tentativas: {notification.attemptCount} · atualização: {formatLocalDate(latestStatusAt(notification))}
              </p>
              {notification.lastErrorCode ? (
                <p className="mt-1 text-xs font-medium text-rose-700">
                  Falha: {notification.lastErrorCode}
                </p>
              ) : null}
            </div>

            {RESENDABLE_STATUSES.has(notification.status) ? (
              <form
                method="post"
                action={`/api/internal/admin/orders/${orderId}/notifications/${notification.id}/resend`}
              >
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:w-auto"
                >
                  Reenviar e-mail
                </button>
              </form>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
