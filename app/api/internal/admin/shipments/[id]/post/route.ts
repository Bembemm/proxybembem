import type { NextRequest } from "next/server.js"
import { authorizeAdminAccess } from "../../../../../../../lib/server/admin-auth.ts"
import {
  isAllowedCheckoutOrigin,
  resolvePublicSiteUrl,
} from "../../../../../../../lib/server/env.ts"
import { consumeRateLimit } from "../../../../../../../lib/server/rate-limit.ts"
import { postAdminShipment } from "../../../../../../../lib/server/shipment-service.ts"

export const runtime = "nodejs"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PRIVATE_NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate"

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

function adminFailureStatus(reason: string) {
  if (reason === "unavailable") return 503
  if (reason === "not_admin") return 403
  return 401
}

function feedback(outcome: string) {
  switch (outcome) {
    case "posted":
      return "posted"
    case "invalid_state":
      return "shipment-invalid"
    case "busy":
      return "shipment-busy"
    default:
      return "shipment-error"
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
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
    allowed = await consumeRateLimit({
      request,
      scope: "admin-shipping-mutation",
    })
  } catch {
    return response(503)
  }
  if (!allowed) return response(429, { "Retry-After": "300" })

  let admin: Awaited<ReturnType<typeof authorizeAdminAccess>>
  try {
    admin = await authorizeAdminAccess({ touch: true })
  } catch {
    return response(503)
  }
  if (!admin.ok) return response(adminFailureStatus(admin.reason))

  let shipmentId: string
  try {
    shipmentId = (await context.params).id
  } catch {
    return response(404)
  }
  if (!UUID_RE.test(shipmentId)) return response(404)

  let result: Awaited<ReturnType<typeof postAdminShipment>>
  try {
    result = await postAdminShipment({
      shipmentId,
      adminUserId: admin.principal.userId,
    })
  } catch {
    return response(503)
  }

  if (result.outcome === "not_found") return response(404)
  return response(303, {
    Location: `/admin/pedidos/${result.orderId}?shipment=${feedback(result.outcome)}`,
  })
}
