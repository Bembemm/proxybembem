import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseBrowserConfig } from "./config.ts"

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const env = getSupabaseBrowserConfig()

  return createServerClient(env.url, env.publishableKey, {
    cookies: {
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
