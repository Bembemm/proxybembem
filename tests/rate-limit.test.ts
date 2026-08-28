import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import test from "node:test"
import { consumeRateLimit } from "../lib/server/rate-limit.ts"

const KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "RATE_LIMIT_SECRET"] as const
const RATE_SECRET = "rate-limit-secret-12345678901234567890"

async function withEnv(run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>()
  for (const key of KEYS) previous.set(key, process.env[key])

  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "server-secret"
  process.env.RATE_LIMIT_SECRET = RATE_SECRET

  try {
    await run()
  } finally {
    for (const key of KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test("prefers Vercel forwarded IP and sends only its HMAC bucket to Supabase", async (t) => {
  await withEnv(async () => {
    const rawIp = "203.0.113.10"
    const expectedBucket = createHmac("sha256", RATE_SECRET)
      .update(`checkout:${rawIp}`)
      .digest("hex")

    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        assert.equal(
          String(input),
          "https://example.supabase.co/rest/v1/rpc/consume_api_rate_limit",
        )
        const headers = new Headers(init?.headers)
        assert.equal(headers.get("apikey"), "server-secret")

        const bodyText = String(init?.body)
        assert.doesNotMatch(bodyText, /203\.0\.113\.10/)
        assert.deepEqual(JSON.parse(bodyText), {
          p_bucket_key: expectedBucket,
          p_limit: 10,
          p_window_seconds: 600,
        })
        return new Response("true", { status: 200 })
      },
    )

    const request = new Request("https://store.test/api/checkout", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.10, 10.0.0.1",
        "x-forwarded-for": "198.51.100.2",
        "x-real-ip": "192.0.2.3",
      },
    })

    assert.equal(await consumeRateLimit({ request, scope: "checkout" }), true)
  })
})

test("falls through unusable forwarding headers and isolates scopes", async (t) => {
  await withEnv(async () => {
    const expectedBucket = createHmac("sha256", RATE_SECRET)
      .update("shipping-quote:198.51.100.2")
      .digest("hex")

    t.mock.method(
      globalThis,
      "fetch",
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        assert.deepEqual(JSON.parse(String(init?.body)), {
          p_bucket_key: expectedBucket,
          p_limit: 60,
          p_window_seconds: 600,
        })
        return new Response("true", { status: 200 })
      },
    )

    const request = new Request("https://store.test/api/shipping/quote", {
      headers: {
        "x-vercel-forwarded-for": "x".repeat(65),
        "x-forwarded-for": "198.51.100.2, 10.0.0.2",
      },
    })

    assert.equal(await consumeRateLimit({ request, scope: "shipping-quote" }), true)
  })
})

test("uses an unknown bucket when no forwarding IP is usable", async (t) => {
  await withEnv(async () => {
    const expectedBucket = createHmac("sha256", RATE_SECRET)
      .update("checkout:unknown")
      .digest("hex")

    t.mock.method(
      globalThis,
      "fetch",
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const body = JSON.parse(String(init?.body)) as { p_bucket_key: string }
        assert.equal(body.p_bucket_key, expectedBucket)
        return new Response("true", { status: 200 })
      },
    )

    assert.equal(
      await consumeRateLimit({
        request: new Request("https://store.test/api/checkout"),
        scope: "checkout",
      }),
      true,
    )
  })
})

test("returns false when the Supabase rate-limit RPC denies the request", async (t) => {
  await withEnv(async () => {
    t.mock.method(globalThis, "fetch", async () => new Response("false", { status: 200 }))

    assert.equal(
      await consumeRateLimit({
        request: new Request("https://store.test/api/checkout", {
          headers: { "x-real-ip": "192.0.2.4" },
        }),
        scope: "checkout",
      }),
      false,
    )
  })
})
