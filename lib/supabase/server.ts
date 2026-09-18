import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseBrowserConfig } from "./config.ts"
import { authCookieName, type SupabaseAuthScope } from "./auth-scope.ts"

async function createScopedSupabaseServerClient(scope: SupabaseAuthScope) {
  const cookieStore = await cookies()
  const env = getSupabaseBrowserConfig()

  return createServerClient(env.url, env.publishableKey, {
    cookieOptions: {
      name: authCookieName(scope),
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
