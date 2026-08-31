"use client"

import { createBrowserClient } from "@supabase/ssr"
import { getSupabaseBrowserConfig } from "./config.ts"

export function createSupabaseBrowserClient() {
  const env = getSupabaseBrowserConfig()
  return createBrowserClient(env.url, env.publishableKey)
}
