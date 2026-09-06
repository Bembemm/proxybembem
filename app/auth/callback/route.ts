import { NextResponse, type NextRequest } from "next/server"
import { sanitizeAccountNext } from "../../../lib/server/customer-account-actions.ts"
import { resolvePublicSiteUrl } from "../../../lib/server/env.ts"
import { createSupabaseAuthServerClient } from "../../../lib/supabase/auth-server.ts"
import { createSupabaseRouteClient } from "../../../lib/supabase/route.ts"

function redirect(request: NextRequest, path: string) {
  const siteUrl = resolvePublicSiteUrl(request.nextUrl.origin)
  const response = NextResponse.redirect(new URL(path, siteUrl), 303)
  response.headers.set("Cache-Control", "private, no-store")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const flowId = request.nextUrl.searchParams.get("sb_flow_id")
  const tokenHash = request.nextUrl.searchParams.get("token_hash")
  const type = request.nextUrl.searchParams.get("type")
  const next = sanitizeAccountNext(request.nextUrl.searchParams.get("next"))

  const canVerifyTokenHash =
    tokenHash !== null &&
    tokenHash.length > 0 &&
    tokenHash.length <= 2_048 &&
    type === "email"
  const canExchangeCode = code !== null && code.length > 0 && code.length <= 2_048

  if (!canVerifyTokenHash && !canExchangeCode) {
    return redirect(request, "/entrar?erro=callback")
  }

  if (canVerifyTokenHash) {
    try {
      const supabase = createSupabaseAuthServerClient()
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "email",
      })

      if (error || !data.user?.email_confirmed_at) {
        return redirect(request, "/entrar?erro=callback")
      }

      // Verification is intentionally stateless here. Successful auth sessions
      // are persisted by the browser login flow so the reverse proxy never has
      // to transport the large Supabase Set-Cookie response on this GET.
      return redirect(request, "/entrar?confirmado=1")
    } catch {
      return redirect(request, "/entrar?erro=callback")
    }
  }

  // Legacy compatibility for already-issued PKCE confirmation emails.
  let applyToResponse = <T extends NextResponse>(response: T) => response

  try {
    const routeClient = createSupabaseRouteClient(request)
    applyToResponse = routeClient.applyToResponse
    const { error } = await routeClient.supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    )
    if (error) {
      return applyToResponse(redirect(request, "/entrar?erro=callback"))
    }

    const { data, error: userError } = await routeClient.supabase.auth.getUser()
    if (userError || !data.user?.email_confirmed_at) {
      return applyToResponse(redirect(request, "/entrar?erro=callback"))
    }

    return applyToResponse(redirect(request, next))
  } catch {
    return applyToResponse(redirect(request, "/entrar?erro=callback"))
  }
}
