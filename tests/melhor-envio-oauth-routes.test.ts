import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { NextRequest } from "next/server.js"
import { decryptMelhorEnvioToken } from "../lib/server/melhor-envio-token-crypto.ts"

const LEGACY_ADMIN_SECRET = "admin-secret-1234567890123456789012345678901234567890"
const RATE_SECRET = "rate-limit-secret-1234567890123456789012345678901234567890"
const ENCRYPTION_KEY = "a".repeat(64)
const ADMIN_USER_ID = "11111111-1111-4111-8111-111111111111"
const AUTH_SESSION_ID = "22222222-2222-4222-8222-222222222222"
const PHASE5_SCOPE = [
  "shipping-calculate",
  "cart-read",
  "cart-write",
  "orders-read",
  "shipping-checkout",
  "shipping-generate",
  "shipping-print",
  "shipping-tracking",
  "shipping-cancel",
].join(" ")

const ENV_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
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
  process.env.SUPABASE_URL = "https://project.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "supabase-server-secret"
  process.env.RATE_LIMIT_SECRET = RATE_SECRET
  process.env.MELHOR_ENVIO_ENVIRONMENT = "sandbox"
  process.env.MELHOR_ENVIO_CLIENT_ID = "12345"
  process.env.MELHOR_ENVIO_CLIENT_SECRET = "client-secret-never-leak"
  process.env.MELHOR_ENVIO_REDIRECT_URI =
    "https://preview.example/api/melhor-envio/oauth/callback"
  process.env.MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY = ENCRYPTION_KEY
  process.env.MELHOR_ENVIO_OAUTH_ADMIN_SECRET = LEGACY_ADMIN_SECRET
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

function startRequest(input?: { origin?: string }) {
  return new NextRequest("https://preview.example/api/internal/melhor-envio/oauth/start", {
    method: "POST",
    headers: {
      origin: input?.origin ?? "https://preview.example",
      "x-real-ip": "192.0.2.10",
    },
  })
}

function callbackRequest(query: Record<string, string>) {
  const url = new URL("https://preview.example/api/melhor-envio/oauth/callback")
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return new NextRequest(url)
}

async function loadStartHandlerFactory() {
  return import("../lib/server/melhor-envio-oauth-start.ts")
}

async function loadCallbackRoute() {
  return import("../app/api/melhor-envio/oauth/callback/route.ts")
}

function allowedPrincipal() {
  return {
    ok: true as const,
    principal: {
      userId: ADMIN_USER_ID,
      authSessionId: AUTH_SESSION_ID,
      aal: "aal2" as const,
    },
  }
}

test("OAuth start rejects a cross-site Origin before rate limit, admin auth or provider work", async () => {
  await withEnv(async () => {
    const { createMelhorEnvioOAuthStartHandler } = await loadStartHandlerFactory()
    const calls: string[] = []
    const POST = createMelhorEnvioOAuthStartHandler({
      authorizeAdmin: async () => {
        calls.push("auth")
        return allowedPrincipal()
      },
      consumeRateLimit: async () => {
        calls.push("rate")
        return true
      },
      createOAuthState: async () => {
        calls.push("state")
      },
    })

    const response = await POST(startRequest({ origin: "https://evil.example" }))
    assert.equal(response.status, 403)
    assert.deepEqual(calls, [])
  })
})

test("OAuth start rate-limits before admin authorization", async () => {
  await withEnv(async () => {
    const { createMelhorEnvioOAuthStartHandler } = await loadStartHandlerFactory()
    const calls: string[] = []
    const POST = createMelhorEnvioOAuthStartHandler({
      authorizeAdmin: async () => {
        calls.push("auth")
        return allowedPrincipal()
      },
      consumeRateLimit: async () => {
        calls.push("rate")
        return false
      },
      createOAuthState: async () => {
        calls.push("state")
      },
    })

    const response = await POST(startRequest())
    assert.equal(response.status, 429)
    assert.equal(response.headers.get("retry-after"), "900")
    assert.deepEqual(calls, ["rate"])
  })
})

test("OAuth start requires an AAL2 active admin session and maps failures generically", async () => {
  await withEnv(async () => {
    const { createMelhorEnvioOAuthStartHandler } = await loadStartHandlerFactory()

    for (const [reason, expectedStatus] of [
      ["mfa_required", 401],
      ["unauthenticated", 401],
      ["session_expired", 401],
      ["not_admin", 403],
      ["unavailable", 503],
    ] as const) {
      let stateCalls = 0
      const POST = createMelhorEnvioOAuthStartHandler({
        authorizeAdmin: async () => ({ ok: false as const, reason }),
        consumeRateLimit: async () => true,
        createOAuthState: async () => {
          stateCalls += 1
        },
      })

      const response = await POST(startRequest())
      assert.equal(response.status, expectedStatus, reason)
      assert.equal(stateCalls, 0, reason)
      assert.equal(await response.text(), "")
    }
  })
})

test("OAuth start stores only SHA-256(state) for ten minutes after rate limit and admin authorization", async () => {
  await withEnv(async () => {
    const { createMelhorEnvioOAuthStartHandler } = await loadStartHandlerFactory()
    const order: string[] = []
    type StateInsert = {
      stateHash: string
      environment: "sandbox" | "production"
      expiresAt: string
    }
    let stateInsert: StateInsert | null = null

    const POST = createMelhorEnvioOAuthStartHandler({
      authorizeAdmin: async () => {
        order.push("auth")
        return allowedPrincipal()
      },
      consumeRateLimit: async () => {
        order.push("rate")
        return true
      },
      createOAuthState: async (input) => {
        order.push("state")
        stateInsert = input
      },
    })

    const before = Date.now()
    const response = await POST(startRequest())
    const after = Date.now()

    assert.equal(response.status, 303)
    assert.deepEqual(order, ["rate", "auth", "state"])

    const location = response.headers.get("location")
    assert.ok(location)
    const authorize = new URL(location)
    assert.equal(authorize.origin, "https://sandbox.melhorenvio.com.br")
    assert.equal(authorize.pathname, "/oauth/authorize")
    assert.equal(authorize.searchParams.get("scope"), PHASE5_SCOPE)
    const rawState = authorize.searchParams.get("state")
    assert.ok(rawState)
    assert.match(rawState, /^[A-Za-z0-9_-]{43}$/)

    const persistedState = stateInsert as StateInsert | null
    assert.ok(persistedState)
    assert.equal(persistedState.environment, "sandbox")
    assert.equal(
      persistedState.stateHash,
      createHash("sha256").update(rawState).digest("hex"),
    )
    assert.notEqual(persistedState.stateHash, rawState)
    const expiresAt = Date.parse(persistedState.expiresAt)
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

test("OAuth callback exchanges only after state consumption and atomically persists encrypted tokens and exact Phase 5 scopes", async (t) => {
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
        if (url.pathname === "/rest/v1/rpc/upsert_melhor_envio_authorized_credential_v2") {
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
    assert.deepEqual(persistedCredential.p_authorized_scopes, PHASE5_SCOPE.split(" "))
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

test("owner integration page is protected and contains no manual secret input", async () => {
  const source = await readFile(
    new URL("../app/admin/integrations/melhor-envio/page.tsx", import.meta.url),
    "utf8",
  )

  assert.match(source, /requireAdminPageAccess/)
  assert.match(source, /touch:\s*true/)
  assert.match(source, /method=["']post["']/)
  assert.match(source, /action=["']\/api\/internal\/melhor-envio\/oauth\/start["']/)
  assert.doesNotMatch(source, /adminSecret|type=["']password["']|Segredo administrativo/i)
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/)
})
