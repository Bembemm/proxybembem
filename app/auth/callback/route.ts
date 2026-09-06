import { NextResponse, type NextRequest } from "next/server"
import {
  parseAccountProfileMetadata,
  sanitizeAccountNext,
} from "../../../lib/server/customer-account-actions.ts"
import { resolvePublicSiteUrl } from "../../../lib/server/env.ts"
import { ensureOwnCustomerProfile } from "../../../lib/server/customer-profiles.ts"
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

  let applyToResponse = <T extends NextResponse>(response: T) => response

  try {
    const routeClient = createSupabaseRouteClient(request)
    applyToResponse = routeClient.applyToResponse

    if (canVerifyTokenHash) {
      const { error } = await routeClient.supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "email",
      })
      if (error) {
        return applyToResponse(redirect(request, "/entrar?erro=callback"))
      }
    } else if (canExchangeCode) {
      const { error } = await routeClient.supabase.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined,
      )
      if (error) {
        return applyToResponse(redirect(request, "/entrar?erro=callback"))
      }
    }

    const { data, error: userError } = await routeClient.supabase.auth.getUser()
    const user = data.user
    if (userError || !user?.email_confirmed_at) {
      return applyToResponse(redirect(request, "/entrar?erro=callback"))
    }

    if (next === "/redefinir-senha") {
      return applyToResponse(redirect(request, next))
    }

    let profile: ReturnType<typeof parseAccountProfileMetadata>
    try {
      profile = parseAccountProfileMetadata(user.user_metadata)
    } catch {
      return applyToResponse(redirect(request, "/minha-conta/perfil?setup=1"))
    }

    try {
      await ensureOwnCustomerProfile(profile)
    } catch {
      return applyToResponse(redirect(request, "/minha-conta/perfil?setup=1"))
    }

    return applyToResponse(redirect(request, next))
  } catch {
    return applyToResponse(redirect(request, "/entrar?erro=callback"))
  }
}
