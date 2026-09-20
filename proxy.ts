import { NextResponse, type NextRequest } from "next/server"
import {
  buildContentSecurityPolicy,
  createCspNonce,
} from "@/lib/security/content-security-policy"
import {
  needsPageCsp,
  needsSupabaseSession,
} from "@/lib/security/proxy-routing"
import {
  buildUpstreamHeaders,
  updateSupabaseSession,
  type RequestSecurityHeaders,
} from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const pageCsp = needsPageCsp(pathname)
  let security: RequestSecurityHeaders | null = null

  if (pageCsp) {
    const nonce = createCspNonce()
    security = {
      nonce,
      contentSecurityPolicy: buildContentSecurityPolicy({
        nonce,
        nodeEnv: process.env.NODE_ENV,
        melhorEnvioEnvironment: process.env.MELHOR_ENVIO_ENVIRONMENT,
        supabaseBrowserUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      }),
    }
  }

  const response = needsSupabaseSession(pathname)
    ? await updateSupabaseSession(request, security)
    : NextResponse.next({
        request: { headers: buildUpstreamHeaders(request, security) },
      })

  if (security) {
    response.headers.set("Content-Security-Policy", security.contentSecurityPolicy)
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
    "/checkout",
    "/minha-conta/:path*",
    "/api/account/:path*",
    "/api/checkout",
  ],
}
