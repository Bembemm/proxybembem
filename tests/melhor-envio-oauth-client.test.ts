import assert from "node:assert/strict"
import test from "node:test"

const ENV_KEYS = [
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

const ACTIVE_SCOPE = [
  "shipping-calculate",
  "cart-write",
].join(" ")

type OAuthTokens = {
  tokenType: "Bearer"
  accessToken: string
  refreshToken: string
  expiresInSeconds: number
}

type OAuthModule = {
  buildMelhorEnvioAuthorizationUrl(input: { state: string }): string
  exchangeMelhorEnvioAuthorizationCode(code: string): Promise<OAuthTokens>
  refreshMelhorEnvioTokens(refreshToken: string): Promise<OAuthTokens>
  MelhorEnvioOAuthError: new (...args: never[]) => Error & {
    status: number | null
    classification: "unauthenticated" | "provider_error" | "invalid_response"
  }
}

async function loadOAuth(): Promise<OAuthModule> {
  return (await import("../lib/server/melhor-envio-oauth-client.ts")) as OAuthModule
}

async function withOAuthEnv(
  environment: "sandbox" | "production",
  run: () => Promise<void> | void,
) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])

  process.env.MELHOR_ENVIO_ENVIRONMENT = environment
  process.env.MELHOR_ENVIO_CLIENT_ID = "12345"
  process.env.MELHOR_ENVIO_CLIENT_SECRET = "client-secret-never-leak"
  process.env.MELHOR_ENVIO_REDIRECT_URI =
    environment === "sandbox"
      ? "https://preview.example/api/melhor-envio/oauth/callback"
      : "https://www.proxybembem.com.br/api/melhor-envio/oauth/callback"
  process.env.MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY = "a".repeat(64)
  process.env.MELHOR_ENVIO_OAUTH_ADMIN_SECRET = "b".repeat(64)
  process.env.MELHOR_ENVIO_USER_AGENT = "ProxyBembem (contato@proxybembem.com.br)"
  process.env.SHIPPING_ORIGIN_CEP = "86730000"
  process.env.SHIPPING_QUOTE_SECRET = "c".repeat(64)

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

function successfulTokenResponse() {
  return Response.json({
    token_type: "Bearer",
    expires_in: 2_592_000,
    access_token: "provider-access-token",
    refresh_token: "provider-refresh-token",
  })
}

test("builds a least-privilege prepare-only sandbox authorization URL without the client secret", async () => {
  await withOAuthEnv("sandbox", async () => {
    const oauth = await loadOAuth()
    const state = "state-value-with-256-bits-of-randomness-placeholder"
    const url = new URL(oauth.buildMelhorEnvioAuthorizationUrl({ state }))

    assert.equal(url.origin, "https://sandbox.melhorenvio.com.br")
    assert.equal(url.pathname, "/oauth/authorize")
    assert.equal(url.searchParams.get("client_id"), "12345")
    assert.equal(
      url.searchParams.get("redirect_uri"),
      "https://preview.example/api/melhor-envio/oauth/callback",
    )
    assert.equal(url.searchParams.get("response_type"), "code")
    assert.equal(url.searchParams.get("state"), state)
    assert.equal(url.searchParams.get("scope"), ACTIVE_SCOPE)
    assert.equal(url.searchParams.getAll("scope").length, 1)
    assert.doesNotMatch(url.toString(), /client-secret-never-leak/)
  })
})

test("uses the production OAuth host without changing prepare-only scope or callback", async () => {
  await withOAuthEnv("production", async () => {
    const oauth = await loadOAuth()
    const url = new URL(oauth.buildMelhorEnvioAuthorizationUrl({ state: "state-value" }))

    assert.equal(url.origin, "https://melhorenvio.com.br")
    assert.equal(
      url.searchParams.get("redirect_uri"),
      "https://www.proxybembem.com.br/api/melhor-envio/oauth/callback",
    )
    assert.equal(url.searchParams.get("scope"), ACTIVE_SCOPE)
  })
})

test("exchanges an authorization code using a server-side form-encoded OAuth request", async (t) => {
  await withOAuthEnv("sandbox", async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        assert.equal(String(input), "https://sandbox.melhorenvio.com.br/oauth/token")
        assert.equal(init?.method, "POST")
        assert.equal(init?.cache, "no-store")
        assert.ok(init?.signal instanceof AbortSignal)

        const headers = new Headers(init?.headers)
        assert.equal(headers.get("accept"), "application/json")
        assert.equal(headers.get("content-type"), "application/x-www-form-urlencoded")
        assert.equal(headers.get("user-agent"), "ProxyBembem (contato@proxybembem.com.br)")

        const body = new URLSearchParams(String(init?.body))
        assert.deepEqual(Object.fromEntries(body), {
          grant_type: "authorization_code",
          client_id: "12345",
          client_secret: "client-secret-never-leak",
          redirect_uri: "https://preview.example/api/melhor-envio/oauth/callback",
          code: "authorization-code",
        })
        return successfulTokenResponse()
      },
    )

    const oauth = await loadOAuth()
    assert.deepEqual(await oauth.exchangeMelhorEnvioAuthorizationCode("authorization-code"), {
      tokenType: "Bearer",
      accessToken: "provider-access-token",
      refreshToken: "provider-refresh-token",
      expiresInSeconds: 2_592_000,
    })
  })
})

test("refreshes using only the latest refresh token and OAuth client credentials", async (t) => {
  await withOAuthEnv("production", async () => {
    t.mock.method(
      globalThis,
      "fetch",
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        assert.equal(String(input), "https://melhorenvio.com.br/oauth/token")
        const body = new URLSearchParams(String(init?.body))
        assert.deepEqual(Object.fromEntries(body), {
          grant_type: "refresh_token",
          client_id: "12345",
          client_secret: "client-secret-never-leak",
          refresh_token: "latest-refresh-token",
        })
        assert.equal(body.has("redirect_uri"), false)
        assert.equal(body.has("code"), false)
        return successfulTokenResponse()
      },
    )

    const oauth = await loadOAuth()
    assert.deepEqual(await oauth.refreshMelhorEnvioTokens("latest-refresh-token"), {
      tokenType: "Bearer",
      accessToken: "provider-access-token",
      refreshToken: "provider-refresh-token",
      expiresInSeconds: 2_592_000,
    })
  })
})

test("rejects malformed token success responses instead of accepting partial credentials", async (t) => {
  await withOAuthEnv("sandbox", async () => {
    const oauth = await loadOAuth()

    for (const body of [
      {},
      { token_type: "Basic", expires_in: 2_592_000, access_token: "a", refresh_token: "r" },
      { token_type: "Bearer", expires_in: 0, access_token: "a", refresh_token: "r" },
      { token_type: "Bearer", expires_in: 2_592_000, access_token: "", refresh_token: "r" },
      { token_type: "Bearer", expires_in: 2_592_000, access_token: "a", refresh_token: "" },
    ]) {
      t.mock.method(globalThis, "fetch", async () => Response.json(body))
      await assert.rejects(
        () => oauth.refreshMelhorEnvioTokens("refresh-token"),
        (error: unknown) => {
          assert.ok(error instanceof oauth.MelhorEnvioOAuthError)
          assert.equal(error.classification, "invalid_response")
          assert.equal(error.status, 200)
          return true
        },
      )
      t.mock.restoreAll()
    }
  })
})

test("classifies provider authentication rejection without exposing provider bodies or secrets", async (t) => {
  await withOAuthEnv("sandbox", async () => {
    t.mock.method(globalThis, "fetch", async () =>
      new Response(
        JSON.stringify({
          message: "client-secret-never-leak latest-refresh-token provider-access-token",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    )

    const oauth = await loadOAuth()
    await assert.rejects(
      () => oauth.refreshMelhorEnvioTokens("latest-refresh-token"),
      (error: unknown) => {
        assert.ok(error instanceof oauth.MelhorEnvioOAuthError)
        assert.equal(error.classification, "unauthenticated")
        assert.equal(error.status, 401)
        assert.doesNotMatch(error.message, /client-secret|refresh-token|provider-access-token/)
        return true
      },
    )
  })
})

test("classifies non-auth provider failure and network failure safely", async (t) => {
  await withOAuthEnv("sandbox", async () => {
    const oauth = await loadOAuth()

    t.mock.method(globalThis, "fetch", async () => new Response("secret body", { status: 503 }))
    await assert.rejects(
      () => oauth.exchangeMelhorEnvioAuthorizationCode("code"),
      (error: unknown) => {
        assert.ok(error instanceof oauth.MelhorEnvioOAuthError)
        assert.equal(error.classification, "provider_error")
        assert.equal(error.status, 503)
        assert.doesNotMatch(error.message, /secret body/)
        return true
      },
    )
    t.mock.restoreAll()

    t.mock.method(globalThis, "fetch", async () => {
      throw new Error("network secret detail")
    })
    await assert.rejects(
      () => oauth.exchangeMelhorEnvioAuthorizationCode("code"),
      (error: unknown) => {
        assert.ok(error instanceof oauth.MelhorEnvioOAuthError)
        assert.equal(error.classification, "provider_error")
        assert.equal(error.status, null)
        assert.doesNotMatch(error.message, /network secret detail/)
        return true
      },
    )
  })
})
