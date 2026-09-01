export interface SupabaseBrowserConfig {
  url: string
  publishableKey: string
}

function requiredPublic(name: string, rawValue: string | undefined) {
  const value = rawValue?.trim()
  if (!value) {
    throw new Error(`Missing required public environment variable: ${name}`)
  }
  return value
}

export function getSupabaseBrowserConfig(): SupabaseBrowserConfig {
  const rawUrl = requiredPublic(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  )

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL")
  }

  if (parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS")
  }

  const publishableKey = requiredPublic(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
  if (!publishableKey.startsWith("sb_publishable_")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable key")
  }

  return {
    url: parsed.origin,
    publishableKey,
  }
}
