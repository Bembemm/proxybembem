import assert from "node:assert/strict"
import test from "node:test"
import { getMelhorEnvioEnv } from "../lib/server/env.ts"

const ENV_KEYS = [
  "MELHOR_ENVIO_ENVIRONMENT",
  "MELHOR_ENVIO_USER_AGENT",
  "SHIPPING_ORIGIN_CEP",
  "SHIPPING_QUOTE_SECRET",
] as const

function withShippingEnv(run: () => void) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])

  process.env.MELHOR_ENVIO_ENVIRONMENT = "sandbox"
  process.env.MELHOR_ENVIO_USER_AGENT = "ProxyBembem (contato@proxybembem.com.br)"
  process.env.SHIPPING_ORIGIN_CEP = "86730-000"
  process.env.SHIPPING_QUOTE_SECRET = "q".repeat(64)

  try {
    run()
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test("returns only the static Melhor Envio shipping configuration", () => {
  withShippingEnv(() => {
    assert.deepEqual(getMelhorEnvioEnv(), {
      environment: "sandbox",
      userAgent: "ProxyBembem (contato@proxybembem.com.br)",
      originCep: "86730000",
      quoteSecret: "q".repeat(64),
    })
  })
})
