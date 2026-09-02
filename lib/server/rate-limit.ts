import { createHmac } from "node:crypto"
import { getRateLimitEnv } from "./env.ts"

export type RateLimitScope =
  | "shipping-quote"
  | "checkout"
  | "melhor-envio-oauth-start"
  | "account-signup"
  | "account-login"
  | "account-password-reset"
  | "account-profile"
  | "account-claim"

const LIMITS: Record<RateLimitScope, { limit: number; windowSeconds: number }> = {
  "shipping-quote": { limit: 60, windowSeconds: 600 },
  checkout: { limit: 10, windowSeconds: 600 },
  "melhor-envio-oauth-start": { limit: 5, windowSeconds: 900 },
  "account-signup": { limit: 5, windowSeconds: 900 },
  "account-login": { limit: 10, windowSeconds: 600 },
  "account-password-reset": { limit: 5, windowSeconds: 900 },
  "account-profile": { limit: 20, windowSeconds: 600 },
  "account-claim": { limit: 10, windowSeconds: 600 },
}

function firstUsableForwardedValue(value: string | null): string | null {
  if (!value) return null
  const first = value.split(",", 1)[0]?.trim() ?? ""
  if (!first || first.length > 64) return null
  return first
}

function getClientIp(request: Request): string {
  const headers = [
    "x-vercel-forwarded-for",
    "x-forwarded-for",
    "x-real-ip",
  ] as const

  for (const name of headers) {
    const candidate = firstUsableForwardedValue(request.headers.get(name))
    if (candidate) return candidate
  }

  return "unknown"
}

export async function consumeRateLimit(input: {
  request: Request
  scope: RateLimitScope
}): Promise<boolean> {
  const env = getRateLimitEnv()
  const clientIp = getClientIp(input.request)
  const policy = LIMITS[input.scope]
  const bucketKey = createHmac("sha256", env.rateLimitSecret)
    .update(`${input.scope}:${clientIp}`)
    .digest("hex")

  const response = await fetch(
    `${env.supabaseUrl}/rest/v1/rpc/consume_api_rate_limit`,
    {
      method: "POST",
      headers: {
        apikey: env.supabaseSecretKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_bucket_key: bucketKey,
        p_limit: policy.limit,
        p_window_seconds: policy.windowSeconds,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  )

  if (!response.ok) {
    throw new Error("Rate limit storage request failed")
  }

  const result = (await response.json()) as unknown
  if (typeof result !== "boolean") {
    throw new Error("Rate limit storage returned an invalid response")
  }
  return result
}
