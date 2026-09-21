import assert from "node:assert/strict"
import test from "node:test"
import { getRateLimitEnv } from "../lib/server/env.ts"

const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "RATE_LIMIT_SECRET",
  "VERCEL",
] as const

function withBaseEnv<T>(vercel: boolean, run: () => T) {
  const previous = new Map<string, string | undefined>()
  for (const key of KEYS) previous.set(key, process.env[key])

  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "server-secret"
  process.env.RATE_LIMIT_SECRET = "rate-limit-secret-12345678901234567890"
  if (vercel) process.env.VERCEL = "1"
  else delete process.env.VERCEL

  try {
    return run()
  } finally {
    for (const key of KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test("rate-limit proxy trust is one hop on Vercel", () => {
  withBaseEnv(true, () => {
    assert.equal(getRateLimitEnv().trustedProxyHops, 1)
  })
})

test("rate-limit proxy trust is disabled outside Vercel", () => {
  withBaseEnv(false, () => {
    assert.equal(getRateLimitEnv().trustedProxyHops, 0)
  })
})
