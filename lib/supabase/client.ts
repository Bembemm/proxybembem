"use client"

import { createBrowserClient } from "@supabase/ssr"
import { getSupabaseBrowserConfig } from "./config.ts"

export const CUSTOMER_AUTH_COOKIE_NAME = "pb-customer-auth"
export const ADMIN_AUTH_COOKIE_NAME = "pb-admin-auth"

type BrowserAuthScope = "customer" | "admin"

let customerClient: ReturnType<typeof createBrowserClient> | null = null
let adminClient: ReturnType<typeof createBrowserClient> | null = null

function createScopedBrowserClient(scope: BrowserAuthScope) {
  const env = getSupabaseBrowserConfig()
  return createBrowserClient(env.url, env.publishableKey, {
    cookieOptions: {
      name: scope === "admin" ? ADMIN_AUTH_COOKIE_NAME : CUSTOMER_AUTH_COOKIE_NAME,
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
