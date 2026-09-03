import { NextRequest } from "next/server.js"
import { revokeCurrentAdminSession } from "../../../../lib/server/admin-auth.ts"
import {
  isAllowedCheckoutOrigin,
  resolvePublicSiteUrl,
} from "../../../../lib/server/env.ts"

export const runtime = "nodejs"

function response(status: number, headers?: HeadersInit) {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      ...headers,
    },
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

  await revokeCurrentAdminSession()

  return response(303, {
    Location: new URL("/admin/login", siteUrl).toString(),
  })
}
