import type { NextRequest } from "next/server.js"
import type { AdminAccessResult } from "./admin-auth.ts"
import {
  isAllowedCheckoutOrigin,
  resolvePublicSiteUrl,
} from "./env.ts"
import type { ShipmentActionResult } from "./shipment-service.ts"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PRIVATE_NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate"

export interface AdminShipmentPrepareActionDependencies {
  authorizeAdmin(): Promise<AdminAccessResult>
  consumeRateLimit(request: NextRequest): Promise<boolean>
  prepareShipment(input: {
    orderId: string
    adminUserId: string
  }): Promise<ShipmentActionResult>
}

export interface AdminShipmentPrepareActionContext {
  params: Promise<{ id: string }>
}

function response(status: number, headers?: HeadersInit) {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": PRIVATE_NO_STORE,
      Pragma: "no-cache",
      ...headers,
    },
  })
}

function adminFailureStatus(result: Exclude<AdminAccessResult, { ok: true }>) {
  if (result.reason === "unavailable") return 503
  if (result.reason === "not_admin") return 403
  return 401
}

function feedbackForResult(result: ShipmentActionResult): string | null {
  switch (result.outcome) {
    case "prepared":
      return "prepared"
    case "missing_sender":
      return "sender-missing"
    case "invalid_snapshot":
      return "shipment-invalid"
    case "busy":
      return "shipment-busy"
    case "provider_rejected":
      return "provider-rejected"
    case "reauthorization_required":
      return "reauthorization-required"
    case "attention_required":
      return "shipment-attention"
    case "not_found":
      return null
  }
}

export function createAdminShipmentPrepareActionHandler(
  deps: AdminShipmentPrepareActionDependencies,
) {
  return async function POST(
    request: NextRequest,
    context: AdminShipmentPrepareActionContext,
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

    let allowed: boolean
    try {
      allowed = await deps.consumeRateLimit(request)
    } catch {
      return response(503)
    }
    if (!allowed) {
      return response(429, { "Retry-After": "300" })
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

    let result: ShipmentActionResult
    try {
      result = await deps.prepareShipment({
        orderId,
        adminUserId: admin.principal.userId,
      })
    } catch {
      return response(503)
    }

    const feedback = feedbackForResult(result)
    if (feedback === null) return response(404)

    return response(303, {
      Location: `/admin/pedidos/${orderId}?shipment=${feedback}`,
    })
  }
}
