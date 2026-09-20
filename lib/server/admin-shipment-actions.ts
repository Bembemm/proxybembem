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
      return result.reason === "recipient_matches_sender"
        ? "recipient-same-as-sender"
        : "shipment-invalid"
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

async function authorizeShipmentMutation(input: {
  request: NextRequest
  authorizeAdmin(): Promise<AdminAccessResult>
  consumeRateLimit(request: NextRequest): Promise<boolean>
}): Promise<
  | { ok: true; admin: Extract<AdminAccessResult, { ok: true }> }
  | { ok: false; response: Response }
> {
  const requestOrigin = input.request.nextUrl.origin
  let siteUrl: string
  try {
    siteUrl = resolvePublicSiteUrl(requestOrigin)
  } catch {
    return { ok: false, response: response(503) }
  }

  if (
    !isAllowedCheckoutOrigin({
      originHeader: input.request.headers.get("origin"),
      configuredSiteUrl: siteUrl,
      requestOrigin,
      nodeEnv: process.env.NODE_ENV,
    })
  ) {
    return { ok: false, response: response(403) }
  }

  let allowed: boolean
  try {
    allowed = await input.consumeRateLimit(input.request)
  } catch {
    return { ok: false, response: response(503) }
  }
  if (!allowed) {
    return { ok: false, response: response(429, { "Retry-After": "300" }) }
  }

  let admin: AdminAccessResult
  try {
    admin = await input.authorizeAdmin()
  } catch {
    return { ok: false, response: response(503) }
  }
  if (!admin.ok) {
    return { ok: false, response: response(adminFailureStatus(admin)) }
  }
  return { ok: true, admin }
}

async function orderIdFromContext(
  context: AdminShipmentPrepareActionContext,
): Promise<string | null> {
  try {
    const params = await context.params
    return UUID_RE.test(params.id) ? params.id : null
  } catch {
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
    const authorization = await authorizeShipmentMutation({
      request,
      authorizeAdmin: deps.authorizeAdmin,
      consumeRateLimit: deps.consumeRateLimit,
    })
    if (!authorization.ok) return authorization.response

    const orderId = await orderIdFromContext(context)
    if (!orderId) return response(404)

    let result: ShipmentActionResult
    try {
      result = await deps.prepareShipment({
        orderId,
        adminUserId: authorization.admin.principal.userId,
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
