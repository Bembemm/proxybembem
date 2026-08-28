import assert from "node:assert/strict"
import test from "node:test"
import { getMelhorEnvioEnv } from "../lib/server/env.ts"

const KEYS = [
  "MELHOR_ENVIO_ENVIRONMENT",
  "MELHOR_ENVIO_ACCESS_TOKEN",
  "MELHOR_ENVIO_USER_AGENT",
  "SHIPPING_ORIGIN_CEP",
  "SHIPPING_QUOTE_SECRET",
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
  MELHOR_ENVIO_ACCESS_TOKEN: "sandbox-token",
  MELHOR_ENVIO_USER_AGENT: "ProxyBembem (contato@proxybembem.com.br)",
  SHIPPING_ORIGIN_CEP: "86730-000",
  SHIPPING_QUOTE_SECRET: "12345678901234567890123456789012",
}

test("normalizes and returns valid Melhor Envio server configuration", () => {
  withMelhorEnvioEnv(valid, () => {
    assert.deepEqual(getMelhorEnvioEnv(), {
      environment: "sandbox",
      accessToken: "sandbox-token",
      userAgent: "ProxyBembem (contato@proxybembem.com.br)",
      originCep: "86730000",
      quoteSecret: "12345678901234567890123456789012",
    })
  })
})

test("requires an eight digit shipping origin CEP", () => {
  withMelhorEnvioEnv({ ...valid, SHIPPING_ORIGIN_CEP: "8673" }, () => {
    assert.throws(() => getMelhorEnvioEnv(), /SHIPPING_ORIGIN_CEP/)
  })
})

test("accepts only sandbox or production environment", () => {
  withMelhorEnvioEnv({ ...valid, MELHOR_ENVIO_ENVIRONMENT: "staging" }, () => {
    assert.throws(() => getMelhorEnvioEnv(), /MELHOR_ENVIO_ENVIRONMENT/)
  })
})

test("requires a non-empty user agent", () => {
  withMelhorEnvioEnv({ ...valid, MELHOR_ENVIO_USER_AGENT: "   " }, () => {
    assert.throws(() => getMelhorEnvioEnv(), /MELHOR_ENVIO_USER_AGENT/)
  })
})

test("requires at least 32 characters for quote signing secret", () => {
  withMelhorEnvioEnv({ ...valid, SHIPPING_QUOTE_SECRET: "too-short" }, () => {
    assert.throws(() => getMelhorEnvioEnv(), /SHIPPING_QUOTE_SECRET/)
  })
})
