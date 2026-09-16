import { NextResponse, type NextRequest } from "next/server"
import {
  buildContentSecurityPolicy,
  createCspNonce,
} from "@/lib/security/content-security-policy"
import {
  needsPageCsp,
  needsSupabaseSession,
} from "@/lib/security/proxy-routing"
import { updateSupabaseSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const pageCsp = needsPageCsp(pathname)
  const requestHeaders = new Headers(request.headers)
  let csp: string | null = null

  if (pageCsp) {
    const nonce = createCspNonce()
    csp = buildContentSecurityPolicy({
      nonce,
      nodeEnv: process.env.NODE_ENV,
      melhorEnvioEnvironment: process.env.MELHOR_ENVIO_ENVIRONMENT,
      supabaseBrowserUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    })
    requestHeaders.set("x-nonce", nonce)
    requestHeaders.set("Content-Security-Policy", csp)
  }

  const response = needsSupabaseSession(pathname)
    ? await updateSupabaseSession(request, pageCsp ? requestHeaders : undefined)
    : NextResponse.next({ request: { headers: requestHeaders } })

  if (csp) {
    response.headers.set("Content-Security-Policy", csp)
  }

  return response
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/internal/melhor-envio/oauth/start",
    "/entrar",
    "/criar-conta",
    "/esqueci-a-senha",
    "/redefinir-senha",
    "/auth/callback",
    "/auth/confirm",
    "/minha-conta/:path*",
    "/api/account/:path*",
    "/api/checkout",
  ],
}
