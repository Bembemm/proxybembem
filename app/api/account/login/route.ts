import { NextResponse, type NextRequest } from "next/server"
import {
  isSameOriginAccountRequest,
  parseAccountLoginInput,
  parseAccountProfileMetadata,
} from "../../../../lib/server/customer-account-actions.ts"
import { resolvePublicSiteUrl } from "../../../../lib/server/env.ts"
import { consumeRateLimit } from "../../../../lib/server/rate-limit.ts"
import { createSupabaseRouteClient } from "../../../../lib/supabase/route.ts"

function redirect(request: NextRequest, path: string) {
  const siteUrl = resolvePublicSiteUrl(request.nextUrl.origin)
  const response = NextResponse.redirect(new URL(path, siteUrl), 303)
  response.headers.set("Cache-Control", "private, no-store")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}

function loginErrorPath(next: string, error: "credenciais" | "limite" | "servico" | "requisicao") {
  const search = new URLSearchParams({ erro: error, next })
  return `/entrar?${search.toString()}`
}

export async function POST(request: NextRequest) {
  if (!isSameOriginAccountRequest(request)) {
    return redirect(request, loginErrorPath("/minha-conta", "requisicao"))
  }

  let raw: FormData
  try {
    raw = await request.formData()
  } catch {
    return redirect(request, loginErrorPath("/minha-conta", "credenciais"))
  }

  let input: ReturnType<typeof parseAccountLoginInput>
  try {
    input = parseAccountLoginInput({
      email: raw.get("email"),
      password: raw.get("password"),
      next: raw.get("next"),
    })
  } catch {
    return redirect(request, loginErrorPath("/minha-conta", "credenciais"))
  }

  try {
    if (!(await consumeRateLimit({ request, scope: "account-login" }))) {
      return redirect(request, loginErrorPath(input.next, "limite"))
    }
  } catch {
    return redirect(request, loginErrorPath(input.next, "servico"))
  }

  try {
    const { supabase, applyToResponse } = createSupabaseRouteClient(request)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    })
    const session = data.session

    if (error || !session?.access_token) {
      return applyToResponse(
        redirect(request, loginErrorPath(input.next, "credenciais")),
      )
    }

    const { data: verified, error: userError } = await supabase.auth.getUser(
      session.access_token,
    )
    if (userError || !verified.user?.email_confirmed_at) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined)
      return applyToResponse(
        redirect(request, loginErrorPath(input.next, "credenciais")),
      )
    }

    try {
      const metadata = parseAccountProfileMetadata(verified.user.user_metadata)
      await supabase
        .from("customer_profiles")
        .upsert(
          {
            id: verified.user.id,
            name: metadata.name,
            whatsapp: metadata.whatsapp,
          },
          { onConflict: "id", ignoreDuplicates: true },
        )
    } catch {
      // Profile convenience must never block an otherwise valid login.
    }

    return applyToResponse(redirect(request, input.next))
  } catch {
    return redirect(request, loginErrorPath(input.next, "servico"))
  }
}
