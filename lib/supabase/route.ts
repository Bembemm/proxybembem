import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { type NextRequest, type NextResponse } from "next/server"
import { getSupabaseBrowserConfig } from "./config.ts"
import { CUSTOMER_AUTH_COOKIE_NAME } from "./auth-scope.ts"

type PendingCookie = {
  name: string
  value: string
  options: CookieOptions
}

export function createSupabaseRouteClient(request: NextRequest) {
  const env = getSupabaseBrowserConfig()
  const pendingCookies: PendingCookie[] = []
  const pendingHeaders: Record<string, string> = {}

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookieOptions: {
      name: CUSTOMER_AUTH_COOKIE_NAME,
    },
    auth: {
      experimental: { appendPkceFlowIdToRedirects: true },
    },
    cookies: {
      encode: "tokens-only",
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        pendingCookies.push(...cookiesToSet)
        Object.assign(pendingHeaders, headers)
      },
    },
  })

  function applyToResponse<T extends NextResponse>(response: T): T {
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options)
    })
    Object.entries(pendingHeaders).forEach(([name, value]) => {
      response.headers.set(name, value)
    })
    return response
  }

  function getPendingCookieNames() {
    return pendingCookies.map(({ name }) => name)
  }

  return { supabase, applyToResponse, getPendingCookieNames }
}
