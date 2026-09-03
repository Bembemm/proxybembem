import type { NextRequest } from "next/server.js"
import type { AdminAccessResult } from "./admin-auth.ts"
import {
  type AdminFulfillmentResult,
  type AdminFulfillmentTarget,
  type TransitionAdminOrderFulfillmentInput,
} from "./admin-order-operations.ts"
import {
  isAllowedCheckoutOrigin,
  resolvePublicSiteUrl,
} from "./env.ts"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface AdminOrderActionDependencies {
  targetStatus: AdminFulfillmentTarget
  authorizeAdmin(): Promise<AdminAccessResult>
  transitionOrder(
    input: TransitionAdminOrderFulfillmentInput,
  ): Promise<AdminFulfillmentResult>
}

export interface AdminOrderActionContext {
  params: Promise<{ id: string }>
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

function feedbackForOutcome(outcome: AdminFulfillmentResult["outcome"]) {
  switch (outcome) {
    case "transitioned":
      return "updated"
    case "unchanged":
      return "unchanged"
    case "invalid_transition":
      return "invalid-transition"
    case "payment_precondition_failed":
      return "payment-required"
    case "not_found":
      return null
  }
}

export function createAdminOrderActionHandler(
  deps: AdminOrderActionDependencies,
) {
  return async function POST(
    request: NextRequest,
    context: AdminOrderActionContext,
  ): Promise<Response> {
    const requestOrigin = request.nextUrl.origin

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
    try {
      const params = await context.params
      orderId = params.id
    } catch {
      return response(404)
    }

    if (!UUID_RE.test(orderId)) return response(404)

    let result: AdminFulfillmentResult
    try {
      result = await deps.transitionOrder({
        orderId,
        adminUserId: admin.principal.userId,
        targetStatus: deps.targetStatus,
      })
    } catch {
      return response(503)
    }

    const feedback = feedbackForOutcome(result.outcome)
    if (feedback === null) return response(404)

    return response(303, {
      Location: `/admin/pedidos/${orderId}?status=${feedback}`,
    })
  }
}
