import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseBrowserConfig } from "./config.ts"
import {
  ADMIN_AUTH_COOKIE_NAME,
  CUSTOMER_AUTH_COOKIE_NAME,
} from "./client.ts"

type ServerAuthScope = "customer" | "admin"

async function createScopedSupabaseServerClient(scope: ServerAuthScope) {
  const cookieStore = await cookies()
  const env = getSupabaseBrowserConfig()

  return createServerClient(env.url, env.publishableKey, {
    cookieOptions: {
      name: scope === "admin" ? ADMIN_AUTH_COOKIE_NAME : CUSTOMER_AUTH_COOKIE_NAME,
    },
    cookies: {
      encode: "tokens-only",
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Server Components cannot write cookies; proxy.ts owns refresh writes.
        }
      },
    },
  })
}

export async function createSupabaseServerClient() {
  return createScopedSupabaseServerClient("customer")
}

export async function createAdminSupabaseServerClient() {
  return createScopedSupabaseServerClient("admin")
}
