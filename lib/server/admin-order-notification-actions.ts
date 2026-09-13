import type { AdminAccessResult } from "./admin-auth.ts"
import type { AdminNotificationResendResult } from "./admin-order-notifications.ts"
import {
  isAllowedCheckoutOrigin,
  resolvePublicSiteUrl,
} from "./env.ts"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface AdminNotificationResendActionContext {
  params: Promise<{ id: string; notificationId: string }>
}

export interface AdminNotificationResendActionDependencies {
  authorizeAdmin(): Promise<AdminAccessResult>
  resend(input: {
    orderId: string
    notificationId: string
    adminUserId: string
  }): Promise<AdminNotificationResendResult>
}

function response(status: number, headers?: HeadersInit) {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      ...headers,
    },
  })
}

function adminFailureStatus(result: Exclude<AdminAccessResult, { ok: true }>) {
  if (result.reason === "unavailable") return 503
  if (result.reason === "not_admin") return 403
  return 401
}

function feedbackForOutcome(outcome: AdminNotificationResendResult["outcome"]) {
  switch (outcome) {
    case "created":
      return "resent"
    case "conflict":
      return "resend-conflict"
    case "not_ready":
      return "resend-not-ready"
    case "not_found":
      return null
  }
}

export function createAdminOrderNotificationResendHandler(
  deps: AdminNotificationResendActionDependencies,
) {
  return async function POST(
    request: Request,
    context: AdminNotificationResendActionContext,
  ): Promise<Response> {
    const requestOrigin = new URL(request.url).origin

    let siteUrl: string
    try {
      siteUrl = resolvePublicSiteUrl(requestOrigin)
    } catch {
      return response(503)
    }

    if (
      !isAllowedCheckoutOrigin({
        originHeader: request.headers.get("origin"),
        configuredSiteUrl: siteUrl,
        requestOrigin,
        nodeEnv: process.env.NODE_ENV,
      })
    ) {
      return response(403)
    }

    let admin: AdminAccessResult
    try {
      admin = await deps.authorizeAdmin()
    } catch {
      return response(503)
    }
    if (!admin.ok) return response(adminFailureStatus(admin))

    let orderId: string
    let notificationId: string
    try {
      const params = await context.params
      orderId = params.id
      notificationId = params.notificationId
    } catch {
      return response(404)
    }
    if (!UUID_RE.test(orderId) || !UUID_RE.test(notificationId)) return response(404)

    let result: AdminNotificationResendResult
    try {
      result = await deps.resend({
        orderId,
        notificationId,
        adminUserId: admin.principal.userId,
      })
    } catch {
      return response(503)
    }

    const feedback = feedbackForOutcome(result.outcome)
    if (feedback === null) return response(404)
    return response(303, {
      Location: `/admin/pedidos/${orderId}?notification=${feedback}`,
    })
  }
}
