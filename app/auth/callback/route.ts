import { NextResponse, type NextRequest } from "next/server"
import {
  parseAccountProfileMetadata,
  sanitizeAccountNext,
} from "../../../lib/server/customer-account-actions.ts"
import { resolvePublicSiteUrl } from "../../../lib/server/env.ts"
import { ensureOwnCustomerProfile } from "../../../lib/server/customer-profiles.ts"
import { createSupabaseRouteClient } from "../../../lib/supabase/route.ts"

const SAFE_AUTH_ERROR_CODE = /^[A-Za-z0-9_-]{1,64}$/

function redirect(request: NextRequest, path: string) {
  const siteUrl = resolvePublicSiteUrl(request.nextUrl.origin)
  const response = NextResponse.redirect(new URL(path, siteUrl), 303)
  response.headers.set("Cache-Control", "private, no-store")
  return response
}

function hasPkceCodeVerifierCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some(({ name }) => /-code-verifier(?:\.\d+)?$/.test(name))
}

function sanitizeAuthErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null
  const code = (error as { code?: unknown }).code
  return typeof code === "string" && SAFE_AUTH_ERROR_CODE.test(code) ? code : null
}

function logRecoveryCallbackDiagnostic(input: {
  hasCodeVerifierCookie: boolean
  exchangeSucceeded: boolean
  exchangeErrorCode: string | null
}) {
  console.info("Password recovery callback diagnostic", {
    at: new Date().toISOString(),
    hasCodeVerifierCookie: input.hasCodeVerifierCookie,
    exchangeSucceeded: input.exchangeSucceeded,
    exchangeErrorCode: input.exchangeErrorCode,
  })
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const next = sanitizeAccountNext(request.nextUrl.searchParams.get("next"))
  if (!code || code.length > 2_048) {
    return redirect(request, "/entrar?erro=callback")
  }

  const recovery = next === "/redefinir-senha"
  const hasCodeVerifierCookie = recovery ? hasPkceCodeVerifierCookie(request) : false
  let exchangeCompleted = false
  let applyToResponse = <T extends NextResponse>(response: T) => response

  try {
    const routeClient = createSupabaseRouteClient(request)
    applyToResponse = routeClient.applyToResponse
    const { error } = await routeClient.supabase.auth.exchangeCodeForSession(code)
    exchangeCompleted = true
    if (recovery) {
      logRecoveryCallbackDiagnostic({
        hasCodeVerifierCookie,
        exchangeSucceeded: !error,
        exchangeErrorCode: sanitizeAuthErrorCode(error),
      })
    }
    if (error) {
      return applyToResponse(redirect(request, "/entrar?erro=callback"))
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
  } catch (error) {
    if (recovery && !exchangeCompleted) {
      logRecoveryCallbackDiagnostic({
        hasCodeVerifierCookie,
        exchangeSucceeded: false,
        exchangeErrorCode: sanitizeAuthErrorCode(error),
      })
    }
    return applyToResponse(redirect(request, "/entrar?erro=callback"))
  }
}
