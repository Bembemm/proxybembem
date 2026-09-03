import { NextRequest } from "next/server.js"
import { activateCurrentAdminSession } from "../../../../../lib/server/admin-auth.ts"
import {
  isAllowedCheckoutOrigin,
  resolvePublicSiteUrl,
} from "../../../../../lib/server/env.ts"

export const runtime = "nodejs"

function response(status: number) {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}

export async function POST(request: NextRequest) {
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

  const result = await activateCurrentAdminSession()
  if (result.ok) return response(204)
  if (result.reason === "unavailable") return response(503)
  if (result.reason === "not_admin") return response(403)
  return response(401)
}
