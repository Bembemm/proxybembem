import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { type NextRequest, type NextResponse } from "next/server"
import { getSupabaseBrowserConfig } from "./config.ts"

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
    auth: {
      experimental: { appendPkceFlowIdToRedirects: true },
    },
    cookies: {
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
