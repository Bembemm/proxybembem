import assert from "node:assert/strict"
import test from "node:test"
import { getRateLimitEnv } from "../lib/server/env.ts"

const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "RATE_LIMIT_SECRET",
  "RATE_LIMIT_TRUSTED_PROXY_HOPS",
] as const

function withBaseEnv<T>(trustedProxyHops: string | undefined, run: () => T) {
  const previous = new Map<string, string | undefined>()
  for (const key of KEYS) previous.set(key, process.env[key])

  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "server-secret"
  process.env.RATE_LIMIT_SECRET = "rate-limit-secret-12345678901234567890"
  if (trustedProxyHops === undefined) {
    delete process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS
  } else {
    process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS = trustedProxyHops
  }

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

test("rate-limit proxy trust defaults to zero hops", () => {
  withBaseEnv(undefined, () => {
    assert.equal(getRateLimitEnv().trustedProxyHops, 0)
  })
})

test("rate-limit proxy trust accepts bounded explicit hop counts", () => {
  for (const [raw, expected] of [["1", 1], ["5", 5]] as const) {
    withBaseEnv(raw, () => {
      assert.equal(getRateLimitEnv().trustedProxyHops, expected)
    })
  }
})

test("rate-limit proxy trust rejects malformed or out-of-range values", () => {
  for (const raw of ["-1", "6", "1.5", "abc", ""]) {
    withBaseEnv(raw, () => {
      assert.throws(() => getRateLimitEnv())
    })
  }
})
