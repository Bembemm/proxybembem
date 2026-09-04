import { NextResponse, type NextRequest } from "next/server"
import {
  parseAccountProfileMetadata,
  sanitizeAccountNext,
} from "../../../lib/server/customer-account-actions.ts"
import { resolvePublicSiteUrl } from "../../../lib/server/env.ts"
import { ensureOwnCustomerProfile } from "../../../lib/server/customer-profiles.ts"
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts"

function redirect(request: NextRequest, path: string) {
  const siteUrl = resolvePublicSiteUrl(request.nextUrl.origin)
  const response = NextResponse.redirect(new URL(path, siteUrl), 303)
  response.headers.set("Cache-Control", "private, no-store")
  return response
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const next = sanitizeAccountNext(request.nextUrl.searchParams.get("next"))
  if (!code || code.length > 2_048) {
    return redirect(request, "/entrar?erro=callback")
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return redirect(request, "/entrar?erro=callback")

    const { data, error: userError } = await supabase.auth.getUser()
    const user = data.user
    if (userError || !user?.email_confirmed_at) {
      return redirect(request, "/entrar?erro=callback")
    }

    if (next === "/redefinir-senha") {
      return redirect(request, next)
    }

    let profile: ReturnType<typeof parseAccountProfileMetadata>
    try {
      profile = parseAccountProfileMetadata(user.user_metadata)
    } catch {
      return redirect(request, "/minha-conta/perfil?setup=1")
    }

    try {
      await ensureOwnCustomerProfile(profile)
    } catch {
      return redirect(request, "/minha-conta/perfil?setup=1")
    }

    return redirect(request, next)
  } catch {
    return redirect(request, "/entrar?erro=callback")
  }
}
