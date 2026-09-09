import type { NextRequest } from "next/server.js"
import { authorizeAdminAccess } from "../../../../../../../lib/server/admin-auth.ts"
import { consumeRateLimit } from "../../../../../../../lib/server/rate-limit.ts"
import { getAdminShipmentPrintResource } from "../../../../../../../lib/server/shipment-service.ts"

export const runtime = "nodejs"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PRIVATE_NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate"
const DACE_FORMATS = new Set(["pdf", "jpeg", "zpl"])

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
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

  const format = request.nextUrl.searchParams.get("format") ?? "pdf"
  if (!DACE_FORMATS.has(format)) return response(400)

  let result: Awaited<ReturnType<typeof getAdminShipmentPrintResource>>
  try {
    result = await getAdminShipmentPrintResource({
      shipmentId,
      resource: "dace",
      format: format as "pdf" | "jpeg" | "zpl",
    })
  } catch {
    return response(503)
  }

  if (result.outcome === "not_found") return response(404)
  if (result.outcome !== "ready") {
    return response(result.outcome === "reauthorization_required" ? 401 : 409)
  }

  return response(302, { Location: result.url })
}
