import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseBrowserConfig } from "./config.ts"

const AUTH_FLOW_PATHS = new Set([
  "/admin/login",
  "/admin/mfa",
  "/admin/setup-mfa",
])
const REDIRECT_CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const
const PRIVATE_ACCOUNT_CACHE_CONTROL =
  "private, no-cache, no-store, max-age=0, must-revalidate"
const PRIVATE_ADMIN_CACHE_CONTROL =
  "private, no-cache, no-store, max-age=0, must-revalidate"

export type RequestSecurityHeaders = {
  nonce: string
  contentSecurityPolicy: string
}

export function buildUpstreamHeaders(
  request: NextRequest,
  security: RequestSecurityHeaders | null,
) {
  const headers = new Headers(request.headers)
  if (security) {
    headers.set("x-nonce", security.nonce)
    headers.set("Content-Security-Policy", security.contentSecurityPolicy)
  }
  return headers
}

function nextResponse(
  request: NextRequest,
  security: RequestSecurityHeaders | null,
) {
  return NextResponse.next({
    request: { headers: buildUpstreamHeaders(request, security) },
  })
}

function copySupabaseState(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie)
  }

  for (const name of REDIRECT_CACHE_HEADERS) {
    const value = source.headers.get(name)
    if (value !== null) {
      target.headers.set(name, value)
    }
  }

  return target
}

function disablePrivateBrowserCache(
  response: NextResponse,
  pathname: string,
) {
  const isPrivateAccount =
    pathname === "/minha-conta" || pathname.startsWith("/minha-conta/")
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/")

  if (isPrivateAccount) {
    response.headers.set("Cache-Control", PRIVATE_ACCOUNT_CACHE_CONTROL)
    response.headers.set("Pragma", "no-cache")
    response.headers.set("Expires", "0")
  }

  if (isAdmin) {
    response.headers.set("Cache-Control", PRIVATE_ADMIN_CACHE_CONTROL)
    response.headers.set("Pragma", "no-cache")
    response.headers.set("Expires", "0")
  }

  return response
}

export async function updateSupabaseSession(
  request: NextRequest,
  security: RequestSecurityHeaders | null = null,
) {
  let supabaseResponse = nextResponse(request, security)
  const env = getSupabaseBrowserConfig()

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      encode: "tokens-only",
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })

        supabaseResponse = nextResponse(request, security)
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options)
        })
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value)
        })
      },
    },
  })

  let claims: unknown
  try {
    const { data } = await supabase.auth.getClaims()
    claims = data?.claims
  } catch {
    claims = undefined
  }
  const pathname = request.nextUrl.pathname

  if (
    pathname.startsWith("/admin") &&
    !AUTH_FLOW_PATHS.has(pathname) &&
    !claims
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/admin/login"
    url.search = ""
    return disablePrivateBrowserCache(
      copySupabaseState(
        supabaseResponse,
        NextResponse.redirect(url, { status: 303 }),
      ),
      pathname,
    )
  }

  return disablePrivateBrowserCache(supabaseResponse, pathname)
}
