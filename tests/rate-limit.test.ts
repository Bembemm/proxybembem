import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import test from "node:test"
import { consumeRateLimit } from "../lib/server/rate-limit.ts"

const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "RATE_LIMIT_SECRET",
  "RATE_LIMIT_TRUSTED_PROXY_HOPS",
] as const
const RATE_SECRET = "rate-limit-secret-12345678901234567890"

async function withEnv(
  trustedProxyHops: string | undefined,
  run: () => Promise<void>,
) {
  const previous = new Map<string, string | undefined>()
  for (const key of KEYS) previous.set(key, process.env[key])

  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "server-secret"
  process.env.RATE_LIMIT_SECRET = RATE_SECRET
  if (trustedProxyHops === undefined) {
    delete process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS
  } else {
    process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS = trustedProxyHops
  }

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

test("uses the explicitly trusted forwarding depth and sends only its HMAC bucket to Supabase", async (t) => {
  await withEnv("2", async () => {
    const rawIp = "198.51.100.2"
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
        assert.doesNotMatch(bodyText, /198\.51\.100\.2/)
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
        "x-forwarded-for": "198.51.100.2, 10.0.0.1",
        "x-real-ip": "192.0.2.3",
      },
    })

    assert.equal(await consumeRateLimit({ request, scope: "checkout" }), true)
  })
})

test("malformed forwarded chains fail closed instead of trusting x-real-ip", async (t) => {
  await withEnv("1", async () => {
    const expectedBucket = createHmac("sha256", RATE_SECRET)
      .update("shipping-quote:unknown")
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
        "x-forwarded-for": "x".repeat(65),
        "x-real-ip": "192.0.2.3",
      },
    })

    assert.equal(await consumeRateLimit({ request, scope: "shipping-quote" }), true)
  })
})

test("uses an unknown bucket when no forwarding IP is usable", async (t) => {
  await withEnv("1", async () => {
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

test("default zero proxy trust ignores otherwise valid forwarding headers", async (t) => {
  await withEnv(undefined, async () => {
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
        request: new Request("https://store.test/api/checkout", {
          headers: {
            "x-forwarded-for": "203.0.113.9",
            "x-real-ip": "192.0.2.4",
          },
        }),
        scope: "checkout",
      }),
      true,
    )
  })
})

test("returns false when the Supabase rate-limit RPC denies the request", async (t) => {
  await withEnv("1", async () => {
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

test("uses a separate 5-per-15-minute bucket for Melhor Envio OAuth starts", async (t) => {
  await withEnv("1", async () => {
    const rawIp = "192.0.2.10"
    const expectedBucket = createHmac("sha256", RATE_SECRET)
      .update(`melhor-envio-oauth-start:${rawIp}`)
      .digest("hex")

    t.mock.method(
      globalThis,
      "fetch",
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        assert.deepEqual(JSON.parse(String(init?.body)), {
          p_bucket_key: expectedBucket,
          p_limit: 5,
          p_window_seconds: 900,
        })
        return new Response("true", { status: 200 })
      },
    )

    assert.equal(
      await consumeRateLimit({
        request: new Request("https://store.test/api/internal/melhor-envio/oauth/start", {
          headers: { "x-real-ip": rawIp },
        }),
        scope: "melhor-envio-oauth-start",
      }),
      true,
    )
  })
})

test("shipment admin actions use distinct HMAC buckets for config and preparation mutations", async (t) => {
  await withEnv("1", async () => {
    const rawIp = "192.0.2.55"
    const cases = [
      { scope: "admin-shipping-config", limit: 10, windowSeconds: 600 },
      { scope: "admin-shipping-mutation", limit: 20, windowSeconds: 300 },
    ] as const
    let index = 0

    t.mock.method(
      globalThis,
      "fetch",
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const expected = cases[index++]
        const expectedBucket = createHmac("sha256", RATE_SECRET)
          .update(`${expected.scope}:${rawIp}`)
          .digest("hex")
        assert.deepEqual(JSON.parse(String(init?.body)), {
          p_bucket_key: expectedBucket,
          p_limit: expected.limit,
          p_window_seconds: expected.windowSeconds,
        })
        return new Response("true", { status: 200 })
      },
    )

    const request = new Request("https://store.test/api/internal/admin/shipping", {
      headers: { "x-real-ip": rawIp },
    })
    for (const expected of cases) {
      assert.equal(await consumeRateLimit({ request, scope: expected.scope }), true)
    }
    assert.equal(index, cases.length)
  })
})
