import assert from "node:assert/strict"
import test from "node:test"
import * as envModule from "../lib/server/env.ts"

const KEYS = [
  "MELHOR_ENVIO_ENVIRONMENT",
  "MELHOR_ENVIO_CLIENT_ID",
  "MELHOR_ENVIO_CLIENT_SECRET",
  "MELHOR_ENVIO_REDIRECT_URI",
  "MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY",
  "MELHOR_ENVIO_OAUTH_ADMIN_SECRET",
  "MELHOR_ENVIO_USER_AGENT",
  "SHIPPING_ORIGIN_CEP",
  "SHIPPING_QUOTE_SECRET",
  "CRON_SECRET",
  "MELHOR_ENVIO_ACCESS_TOKEN",
] as const

function withMelhorEnvioEnv(
  values: Partial<Record<(typeof KEYS)[number], string | undefined>>,
  run: () => void,
) {
  const previous = new Map<string, string | undefined>()
  for (const key of KEYS) {
    previous.set(key, process.env[key])
    delete process.env[key]
  }

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value
  }

  try {
    run()
  } finally {
    for (const key of KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

const valid = {
  MELHOR_ENVIO_ENVIRONMENT: "sandbox",
  MELHOR_ENVIO_CLIENT_ID: "12345",
  MELHOR_ENVIO_CLIENT_SECRET: "client-secret",
  MELHOR_ENVIO_REDIRECT_URI: "https://preview.example/api/melhor-envio/oauth/callback",
  MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY: "a".repeat(64),
  MELHOR_ENVIO_OAUTH_ADMIN_SECRET: "b".repeat(64),
  MELHOR_ENVIO_USER_AGENT: "ProxyBembem (contato@proxybembem.com.br)",
  SHIPPING_ORIGIN_CEP: "86730-000",
  SHIPPING_QUOTE_SECRET: "c".repeat(64),
  CRON_SECRET: "d".repeat(64),
}

function getOAuthEnv(): Record<string, unknown> {
  const candidate = (envModule as Record<string, unknown>).getMelhorEnvioOAuthEnv
  assert.equal(
    typeof candidate,
    "function",
    "getMelhorEnvioOAuthEnv must exist before OAuth configuration can be used",
  )
  return (candidate as () => Record<string, unknown>)()
}

function getCronSecret(): string {
  const candidate = (envModule as Record<string, unknown>).getCronSecret
  assert.equal(typeof candidate, "function", "getCronSecret must exist")
  return (candidate as () => string)()
}

test("returns the OAuth Melhor Envio server configuration without a permanent access token", () => {
  withMelhorEnvioEnv(valid, () => {
    assert.deepEqual(getOAuthEnv(), {
      environment: "sandbox",
      clientId: "12345",
      clientSecret: "client-secret",
      redirectUri: "https://preview.example/api/melhor-envio/oauth/callback",
      tokenEncryptionKey: "a".repeat(64),
      oauthAdminSecret: "b".repeat(64),
      userAgent: "ProxyBembem (contato@proxybembem.com.br)",
      originCep: "86730000",
      quoteSecret: "c".repeat(64),
    })
  })
})

test("does not require MELHOR_ENVIO_ACCESS_TOKEN for OAuth configuration", () => {
  withMelhorEnvioEnv({ ...valid, MELHOR_ENVIO_ACCESS_TOKEN: undefined }, () => {
    assert.doesNotThrow(() => getOAuthEnv())
  })
})

test("requires an eight digit shipping origin CEP", () => {
  withMelhorEnvioEnv({ ...valid, SHIPPING_ORIGIN_CEP: "8673" }, () => {
    assert.throws(() => getOAuthEnv(), /SHIPPING_ORIGIN_CEP/)
  })
})

test("accepts only sandbox or production environment", () => {
  withMelhorEnvioEnv({ ...valid, MELHOR_ENVIO_ENVIRONMENT: "staging" }, () => {
    assert.throws(() => getOAuthEnv(), /MELHOR_ENVIO_ENVIRONMENT/)
  })
})

test("requires a non-empty user agent", () => {
  withMelhorEnvioEnv({ ...valid, MELHOR_ENVIO_USER_AGENT: "   " }, () => {
    assert.throws(() => getOAuthEnv(), /MELHOR_ENVIO_USER_AGENT/)
  })
})

test("requires an exactly 256-bit hexadecimal token encryption key", () => {
  for (const invalid of ["a".repeat(63), "a".repeat(65), "z".repeat(64)]) {
    withMelhorEnvioEnv({ ...valid, MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY: invalid }, () => {
      assert.throws(() => getOAuthEnv(), /MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY/)
    })
  }
})

test("requires a valid static Melhor Envio redirect URL", () => {
  withMelhorEnvioEnv({ ...valid, MELHOR_ENVIO_REDIRECT_URI: "not-a-url" }, () => {
    assert.throws(() => getOAuthEnv(), /MELHOR_ENVIO_REDIRECT_URI/)
  })
})

test("requires HTTPS redirect URI in production", () => {
  withMelhorEnvioEnv(
    {
      ...valid,
      MELHOR_ENVIO_ENVIRONMENT: "production",
      MELHOR_ENVIO_REDIRECT_URI: "http://www.proxybembem.com.br/api/melhor-envio/oauth/callback",
    },
    () => {
      assert.throws(() => getOAuthEnv(), /HTTPS/)
    },
  )
})

test("requires strong quote, admin and cron secrets", () => {
  for (const key of [
    "SHIPPING_QUOTE_SECRET",
    "MELHOR_ENVIO_OAUTH_ADMIN_SECRET",
    "CRON_SECRET",
  ] as const) {
    withMelhorEnvioEnv({ ...valid, [key]: "too-short" }, () => {
      const action = key === "CRON_SECRET" ? getCronSecret : getOAuthEnv
      assert.throws(() => action(), new RegExp(key))
    })
  }
})

test("returns the configured cron secret", () => {
  withMelhorEnvioEnv(valid, () => {
    assert.equal(getCronSecret(), "d".repeat(64))
  })
})
