"use client"

import { createBrowserClient } from "@supabase/ssr"
import { getSupabaseBrowserConfig } from "./config.ts"
import { authCookieName, type SupabaseAuthScope } from "./auth-scope.ts"

let customerClient: ReturnType<typeof createBrowserClient> | null = null
let adminClient: ReturnType<typeof createBrowserClient> | null = null

function createScopedBrowserClient(scope: SupabaseAuthScope) {
  const env = getSupabaseBrowserConfig()
  return createBrowserClient(env.url, env.publishableKey, {
    cookieOptions: {
      name: authCookieName(scope),
    },
    cookies: {
      encode: "tokens-only",
    },
    // @supabase/ssr otherwise caches one global browser client regardless of
    // cookieOptions. Each auth scope must own an independent client instance.
    isSingleton: false,
  })
}

export function createSupabaseBrowserClient() {
  customerClient ??= createScopedBrowserClient("customer")
  return customerClient
}

export function createAdminSupabaseBrowserClient() {
  adminClient ??= createScopedBrowserClient("admin")
  return adminClient
}
