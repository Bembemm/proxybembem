import type { SupabaseAuthScope } from "../supabase/auth-scope.ts"

const EXACT_SESSION_PATHS = new Set([
  "/entrar",
  "/criar-conta",
  "/esqueci-a-senha",
  "/redefinir-senha",
  "/auth/callback",
  "/auth/confirm",
  "/api/checkout",
  "/api/internal/melhor-envio/oauth/start",
])

export function needsSupabaseSession(pathname: string) {
  return (
    EXACT_SESSION_PATHS.has(pathname) ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/admin/") ||
    pathname === "/minha-conta" ||
    pathname.startsWith("/minha-conta/") ||
    pathname.startsWith("/api/account/")
  )
}

export function needsPageCsp(pathname: string) {
  return !(
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  )
}


export function supabaseAuthScopeForPath(pathname: string): SupabaseAuthScope {
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/admin/") ||
    pathname === "/api/internal/melhor-envio/oauth/start"
  ) {
    return "admin"
  }

  return "customer"
}
