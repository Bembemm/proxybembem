import { createHmac } from "node:crypto"
import { resolveClientIp } from "./client-ip.ts"
import { getRateLimitEnv } from "./env.ts"

export type RateLimitScope =
  | "shipping-quote"
  | "address-lookup"
  | "checkout"
  | "melhor-envio-oauth-start"
  | "admin-shipping-config"
  | "admin-shipping-mutation"
  | "admin-shipping-spend"
  | "account-signup"
  | "account-login"
  | "account-password-reset"
  | "account-password-recovery"
  | "account-password-change"
  | "account-profile"
  | "account-confirmation-resend"
  | "account-email-change"
  | "account-address"

const LIMITS: Record<RateLimitScope, { limit: number; windowSeconds: number }> = {
  "shipping-quote": { limit: 60, windowSeconds: 600 },
  "address-lookup": { limit: 60, windowSeconds: 600 },
  checkout: { limit: 10, windowSeconds: 600 },
  "melhor-envio-oauth-start": { limit: 5, windowSeconds: 900 },
  "admin-shipping-config": { limit: 10, windowSeconds: 600 },
  "admin-shipping-mutation": { limit: 20, windowSeconds: 300 },
  "admin-shipping-spend": { limit: 5, windowSeconds: 300 },
  "account-signup": { limit: 5, windowSeconds: 900 },
  "account-login": { limit: 10, windowSeconds: 600 },
  "account-password-reset": { limit: 5, windowSeconds: 900 },
  "account-password-recovery": { limit: 5, windowSeconds: 900 },
  "account-password-change": { limit: 5, windowSeconds: 900 },
  "account-profile": { limit: 20, windowSeconds: 600 },
  "account-confirmation-resend": { limit: 5, windowSeconds: 900 },
  "account-email-change": { limit: 5, windowSeconds: 900 },
  "account-address": { limit: 30, windowSeconds: 600 },
}

export async function consumeRateLimit(input: {
  request: Request
  scope: RateLimitScope
}): Promise<boolean> {
  const env = getRateLimitEnv()
  const clientIp =
    resolveClientIp({
      forwardedFor: input.request.headers.get("x-forwarded-for"),
      realIp: input.request.headers.get("x-real-ip"),
      trustedProxyHops: env.trustedProxyHops,
    }) ?? "unknown"
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
