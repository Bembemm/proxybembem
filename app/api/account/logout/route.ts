import { NextResponse, type NextRequest } from "next/server"
import { isSameOriginAccountRequest } from "../../../../lib/server/customer-account-actions.ts"
import { resolvePublicSiteUrl } from "../../../../lib/server/env.ts"
import { createSupabaseRouteClient } from "../../../../lib/supabase/route.ts"

function privateJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  })
}

function redirectToLogin(request: NextRequest) {
  const siteUrl = resolvePublicSiteUrl(request.nextUrl.origin)
  const response = NextResponse.redirect(new URL("/entrar", siteUrl), 303)
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, max-age=0, must-revalidate",
  )
  response.headers.set("Pragma", "no-cache")
  response.headers.set("Expires", "0")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}

export async function POST(request: NextRequest) {
  if (!isSameOriginAccountRequest(request)) {
    return privateJson(403, { ok: false, message: "Requisição inválida." })
  }

  try {
    const { supabase, applyToResponse } = createSupabaseRouteClient(request)
    const { error } = await supabase.auth.signOut({ scope: "local" })
    if (error) {
      return applyToResponse(
        privateJson(503, {
          ok: false,
          message: "Serviço temporariamente indisponível.",
        }),
      )
    }

    return applyToResponse(redirectToLogin(request))
  } catch {
    return privateJson(503, {
      ok: false,
      message: "Serviço temporariamente indisponível.",
    })
  }
}
