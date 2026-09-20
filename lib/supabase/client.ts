"use client"

import {
  createBrowserClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr"
import { getSupabaseBrowserConfig } from "./config.ts"
import { authCookieName, type SupabaseAuthScope } from "./auth-scope.ts"

function createScopedBrowserClient(scope: SupabaseAuthScope) {
  const env = getSupabaseBrowserConfig()
  return createBrowserClient(env.url, env.publishableKey, {
    cookieOptions: {
      name: authCookieName(scope),
    },
    cookies: {
      encode: "tokens-only",
      getAll() {
        return parseCookieHeader(document.cookie)
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          document.cookie = serializeCookieHeader(name, value, options)
        }
      },
    },
    // @supabase/ssr otherwise caches one global browser client regardless of
    // cookieOptions. Each auth scope must own an independent client instance.
    isSingleton: false,
  })
}

type ScopedBrowserClient = ReturnType<typeof createScopedBrowserClient>

let customerClient: ScopedBrowserClient | null = null
let adminClient: ScopedBrowserClient | null = null

export function createSupabaseBrowserClient() {
  customerClient ??= createScopedBrowserClient("customer")
  return customerClient
}

export function createAdminSupabaseBrowserClient() {
  adminClient ??= createScopedBrowserClient("admin")
  return adminClient
}
