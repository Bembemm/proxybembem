import assert from "node:assert/strict"
import test from "node:test"

const ENV_KEYS = [
  "MELHOR_ENVIO_ENVIRONMENT",
  "MELHOR_ENVIO_CLIENT_ID",
  "MELHOR_ENVIO_CLIENT_SECRET",
  "MELHOR_ENVIO_REDIRECT_URI",
  "MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY",
  "MELHOR_ENVIO_USER_AGENT",
  "SHIPPING_ORIGIN_CEP",
  "SHIPPING_QUOTE_SECRET",
] as const

const EXPECTED_SCOPES = [
  "shipping-calculate",
  "cart-read",
  "cart-write",
  "orders-read",
  "shipping-checkout",
  "shipping-generate",
  "shipping-print",
  "shipping-tracking",
  "shipping-cancel",
]

async function withOAuthEnv(run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])

  process.env.MELHOR_ENVIO_ENVIRONMENT = "sandbox"
  process.env.MELHOR_ENVIO_CLIENT_ID = "12345"
  process.env.MELHOR_ENVIO_CLIENT_SECRET = "client-secret-never-leak"
  process.env.MELHOR_ENVIO_REDIRECT_URI =
    "https://preview.example/api/melhor-envio/oauth/callback"
  process.env.MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY = "a".repeat(64)
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

test("authorization URL requests exactly the approved Phase 5 least-privilege scopes", async () => {
  await withOAuthEnv(async () => {
    const { buildMelhorEnvioAuthorizationUrl } = await import(
      "../lib/server/melhor-envio-oauth-client.ts"
    )
    const url = new URL(
      buildMelhorEnvioAuthorizationUrl({ state: "state-value" }),
    )

    assert.deepEqual(
      (url.searchParams.get("scope") ?? "").split(" ").filter(Boolean),
      EXPECTED_SCOPES,
    )
    assert.equal(url.searchParams.getAll("scope").length, 1)
    assert.doesNotMatch(url.toString(), /client-secret-never-leak/)
  })
})
