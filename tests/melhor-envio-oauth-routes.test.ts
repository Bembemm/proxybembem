import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { NextRequest } from "next/server.js"
import { decryptMelhorEnvioToken } from "../lib/server/melhor-envio-token-crypto.ts"

const ADMIN_SECRET = "admin-secret-1234567890123456789012345678901234567890"
const RATE_SECRET = "rate-limit-secret-1234567890123456789012345678901234567890"
const ENCRYPTION_KEY = "a".repeat(64)

const ENV_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_ENV",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "RATE_LIMIT_SECRET",
  "MELHOR_ENVIO_ENVIRONMENT",
  "MELHOR_ENVIO_CLIENT_ID",
  "MELHOR_ENVIO_CLIENT_SECRET",
  "MELHOR_ENVIO_REDIRECT_URI",
  "MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY",
  "MELHOR_ENVIO_OAUTH_ADMIN_SECRET",
  "MELHOR_ENVIO_USER_AGENT",
  "SHIPPING_ORIGIN_CEP",
  "SHIPPING_QUOTE_SECRET",
] as const

async function withEnv(run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])

  process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example"
  process.env.VERCEL_ENV = "preview"
  process.env.SUPABASE_URL = "https://project.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "supabase-server-secret"
  process.env.RATE_LIMIT_SECRET = RATE_SECRET
  process.env.MELHOR_ENVIO_ENVIRONMENT = "sandbox"
  process.env.MELHOR_ENVIO_CLIENT_ID = "12345"
  process.env.MELHOR_ENVIO_CLIENT_SECRET = "client-secret-never-leak"
  process.env.MELHOR_ENVIO_REDIRECT_URI =
    "https://preview.example/api/melhor-envio/oauth/callback"
  process.env.MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY = ENCRYPTION_KEY
  process.env.MELHOR_ENVIO_OAUTH_ADMIN_SECRET = ADMIN_SECRET
  process.env.MELHOR_ENVIO_USER_AGENT = "ProxyBembem (contato@proxybembem.com.br)"
  process.env.SHIPPING_ORIGIN_CEP = "86730000"
  process.env.SHIPPING_QUOTE_SECRET = "q".repeat(64)

  try {
    await run()
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function startRequest(input?: { origin?: string; adminSecret?: string; body?: string }) {
  const body =
    input?.body ??
    new URLSearchParams({ adminSecret: input?.adminSecret ?? ADMIN_SECRET }).toString()
  return new NextRequest("https://preview.example/api/internal/melhor-envio/oauth/start", {
    method: "POST",
    headers: {
      origin: input?.origin ?? "https://preview.example",
      "content-type": "application/x-www-form-urlencoded",
      "x-real-ip": "192.0.2.10",
    },
    body,
  })
}

function callbackRequest(query: Record<string, string>) {
  const url = new URL("https://preview.example/api/melhor-envio/oauth/callback")
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return new NextRequest(url)
}

async function loadStartRoute() {
  return import("../app/api/internal/melhor-envio/oauth/start/route.ts")
}

async function loadCallbackRoute() {
  return import("../app/api/melhor-envio/oauth/callback/route.ts")
}

test("OAuth start rejects a cross-site Origin before rate limit, secret parsing or provider work", async (t) => {
  await withEnv(async () => {
    let fetchCalls = 0
    t.mock.method(globalThis, "fetch", async () => {
      fetchCalls += 1
      throw new Error("must not fetch")
    })

    const { POST } = await loadStartRoute()
    const response = await POST(startRequest({ origin: "https://evil.example" }))
    assert.equal(response.status, 403)
    assert.equal(fetchCalls, 0)
    assert.doesNotMatch(await response.text(), new RegExp(ADMIN_SECRET))
  })
})

test("OAuth start rate-limits before accepting the owner secret and never echoes it", async (t) => {
  await withEnv(async () => {
    let calls = 0
    t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
      calls += 1
      assert.equal(
        new URL(String(input)).pathname,
        "/rest/v1/rpc/consume_api_rate_limit",
      )
      return Response.json(true)
    })

    const { POST } = await loadStartRoute()
    const response = await POST(startRequest({ adminSecret: "wrong-secret-value" }))
    assert.equal(response.status, 401)
    assert.equal(calls, 1)
    const text = await response.text()
    assert.doesNotMatch(text, /wrong-secret-value/)
    assert.doesNotMatch(text, new RegExp(ADMIN_SECRET))
  })
})

test("OAuth start returns 429 when the protected rate-limit bucket denies the attempt", async (t) => {
  await withEnv(async () => {
    t.mock.method(globalThis, "fetch", async () => Response.json(false))

    const { POST } = await loadStartRoute()
    const response = await POST(startRequest())
    assert.equal(response.status, 429)
    assert.equal(response.headers.get("retry-after"), "900")
  })
})

test("OAuth start stores only SHA-256(state) for ten minutes and redirects to least-privilege authorization", async (t) => {
  await withEnv(async () => {
    let stateInsert: Record<string, unknown> | null = null
    let calls = 0

    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        calls += 1
        const url = new URL(String(input))
        if (url.pathname === "/rest/v1/rpc/consume_api_rate_limit") {
          return Response.json(true)
        }
        if (url.pathname === "/rest/v1/melhor_envio_oauth_states") {
          stateInsert = JSON.parse(String(init?.body)) as Record<string, unknown>
          return new Response(null, { status: 201 })
        }
        throw new Error(`unexpected fetch ${url}`)
      },
    )

    const before = Date.now()
    const { POST } = await loadStartRoute()
    const response = await POST(startRequest())
    const after = Date.now()

    assert.equal(response.status, 303)
    assert.equal(calls, 2)
    const location = response.headers.get("location")
    assert.ok(location)
    const authorize = new URL(location)
    assert.equal(authorize.origin, "https://sandbox.melhorenvio.com.br")
    assert.equal(authorize.pathname, "/oauth/authorize")
    assert.equal(authorize.searchParams.get("scope"), "shipping-calculate")
    const rawState = authorize.searchParams.get("state")
    assert.ok(rawState)
    assert.match(rawState, /^[A-Za-z0-9_-]{43}$/)

    const persistedState = stateInsert as Record<string, unknown> | null
    assert.ok(persistedState)
    assert.equal(persistedState.environment, "sandbox")
    assert.equal(
      persistedState.state_hash,
      createHash("sha256").update(rawState).digest("hex"),
    )
    assert.notEqual(persistedState.state_hash, rawState)
    const expiresAt = Date.parse(String(persistedState.expires_at))
    assert.ok(expiresAt >= before + 10 * 60 * 1000)
    assert.ok(expiresAt <= after + 10 * 60 * 1000)
    assert.doesNotMatch(location, /client-secret-never-leak|admin-secret/)
  })
})

test("OAuth callback rejects malformed/provider-denied callbacks without touching token storage", async (t) => {
  await withEnv(async () => {
    let fetchCalls = 0
    t.mock.method(globalThis, "fetch", async () => {
      fetchCalls += 1
      throw new Error("must not fetch")
    })

    const { GET } = await loadCallbackRoute()
    const invalidQueries: Array<Record<string, string>> = [
      {},
      { error: "access_denied", state: "s".repeat(43) },
      { code: "", state: "s".repeat(43) },
      { code: "code", state: "short" },
      { code: "x".repeat(2049), state: "s".repeat(43) },
    ]
    for (const query of invalidQueries) {
      const response = await GET(callbackRequest(query))
      assert.equal(response.status, 303)
      assert.equal(
        new URL(response.headers.get("location") ?? "https://invalid").pathname,
        "/admin/integrations/melhor-envio",
      )
      assert.equal(
        new URL(response.headers.get("location") ?? "https://invalid").searchParams.get("status"),
        "failed",
      )
    }
    assert.equal(fetchCalls, 0)
  })
})

test("OAuth callback consumes state once before token exchange and rejects an expired/replayed state", async (t) => {
  await withEnv(async () => {
    let calls = 0
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        calls += 1
        const url = new URL(String(input))
        assert.equal(url.pathname, "/rest/v1/rpc/consume_melhor_envio_oauth_state")
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        assert.equal(body.p_environment, "sandbox")
        assert.equal(
          body.p_state_hash,
          createHash("sha256").update("s".repeat(43)).digest("hex"),
        )
        return Response.json(false)
      },
    )

    const { GET } = await loadCallbackRoute()
    const response = await GET(
      callbackRequest({ code: "authorization-code", state: "s".repeat(43) }),
    )
    assert.equal(response.status, 303)
    assert.equal(new URL(response.headers.get("location")!).searchParams.get("status"), "failed")
    assert.equal(calls, 1)
  })
})

test("OAuth callback exchanges only after state consumption and atomically persists encrypted tokens", async (t) => {
  await withEnv(async () => {
    const order: string[] = []
    let upsertBody: Record<string, unknown> | null = null

    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input))
        if (url.pathname === "/rest/v1/rpc/consume_melhor_envio_oauth_state") {
          order.push("consume-state")
          return Response.json(true)
        }
        if (url.origin === "https://sandbox.melhorenvio.com.br" && url.pathname === "/oauth/token") {
          order.push("exchange-code")
          const body = new URLSearchParams(String(init?.body))
          assert.equal(body.get("code"), "authorization-code")
          return Response.json({
            token_type: "Bearer",
            access_token: "live-access-token",
            refresh_token: "live-refresh-token",
            expires_in: 2_592_000,
          })
        }
        if (url.pathname === "/rest/v1/rpc/upsert_melhor_envio_authorized_credential") {
          order.push("upsert-credential")
          upsertBody = JSON.parse(String(init?.body)) as Record<string, unknown>
          return Response.json(1)
        }
        throw new Error(`unexpected fetch ${url}`)
      },
    )

    const { GET } = await loadCallbackRoute()
    const response = await GET(
      callbackRequest({ code: "authorization-code", state: "s".repeat(43) }),
    )

    assert.equal(response.status, 303)
    const redirect = new URL(response.headers.get("location")!)
    assert.equal(redirect.pathname, "/admin/integrations/melhor-envio")
    assert.equal(redirect.searchParams.get("status"), "connected")
    assert.deepEqual(order, ["consume-state", "exchange-code", "upsert-credential"])

    const persistedCredential = upsertBody as Record<string, unknown> | null
    assert.ok(persistedCredential)
    assert.equal(persistedCredential.p_environment, "sandbox")
    assert.notEqual(persistedCredential.p_access_token_envelope, "live-access-token")
    assert.notEqual(persistedCredential.p_refresh_token_envelope, "live-refresh-token")
    assert.equal(
      decryptMelhorEnvioToken({
        envelope: String(persistedCredential.p_access_token_envelope),
        environment: "sandbox",
        kind: "access",
        encryptionKeyHex: ENCRYPTION_KEY,
      }),
      "live-access-token",
    )
    assert.equal(
      decryptMelhorEnvioToken({
        envelope: String(persistedCredential.p_refresh_token_envelope),
        environment: "sandbox",
        kind: "refresh",
        encryptionKeyHex: ENCRYPTION_KEY,
      }),
      "live-refresh-token",
    )
    assert.ok(Date.parse(String(persistedCredential.p_access_token_expires_at)) > Date.now())
    assert.doesNotMatch(response.headers.get("location")!, /live-access-token|live-refresh-token/)
  })
})

test("owner integration page uses a non-persistent password POST form", async () => {
  const source = await readFile(
    new URL("../app/admin/integrations/melhor-envio/page.tsx", import.meta.url),
    "utf8",
  )

  assert.match(source, /type=["']password["']/)
  assert.match(source, /name=["']adminSecret["']/)
  assert.match(source, /autoComplete=["']off["']/)
  assert.match(source, /method=["']post["']/)
  assert.match(source, /action=["']\/api\/internal\/melhor-envio\/oauth\/start["']/)
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/)
})
