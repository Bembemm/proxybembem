import { createClient } from "@supabase/supabase-js"
import { getSupabaseBrowserConfig } from "./config.ts"

export function createSupabaseAuthServerClient() {
  const env = getSupabaseBrowserConfig()

  return createClient(env.url, env.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
