import { type NextRequest } from "next/server"
import { updateSupabaseSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  return updateSupabaseSession(request)
}

export const config = {
  matcher: [
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
