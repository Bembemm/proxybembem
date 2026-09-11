import { createClient } from "@supabase/supabase-js"
import { getSupabaseEnv } from "./env.ts"

export function createSupabaseServiceClient() {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()

  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
