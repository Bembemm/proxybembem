import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseBrowserConfig } from "./config.ts"

const AUTH_FLOW_PATHS = new Set([
  "/admin/login",
  "/admin/mfa",
  "/admin/setup-mfa",
])
const REDIRECT_CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const

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

export async function updateSupabaseSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const env = getSupabaseBrowserConfig()

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })

        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options)
        })
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value)
        })
      },
    },
  })

  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const pathname = request.nextUrl.pathname

  if (
    pathname.startsWith("/admin") &&
    !AUTH_FLOW_PATHS.has(pathname) &&
    !claims
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/admin/login"
    url.search = ""
    return copySupabaseState(
      supabaseResponse,
      NextResponse.redirect(url, { status: 303 }),
    )
  }

  return supabaseResponse
}
