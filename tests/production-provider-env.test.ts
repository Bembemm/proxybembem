import assert from "node:assert/strict"
import test from "node:test"
import { getMelhorEnvioEnv, getMercadoPagoEnv } from "../lib/server/env.ts"

const ENV_KEYS = [
  "NODE_ENV",
  "VERCEL_ENV",
  "MERCADO_PAGO_ENVIRONMENT",
  "MERCADO_PAGO_ACCESS_TOKEN",
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "MELHOR_ENVIO_ENVIRONMENT",
  "MELHOR_ENVIO_USER_AGENT",
  "SHIPPING_ORIGIN_CEP",
  "SHIPPING_QUOTE_SECRET",
] as const

const baseEnv = {
  MERCADO_PAGO_ENVIRONMENT: "sandbox",
  MERCADO_PAGO_ACCESS_TOKEN: "test-access-token",
  MERCADO_PAGO_WEBHOOK_SECRET: "w".repeat(64),
  MELHOR_ENVIO_ENVIRONMENT: "sandbox",
  MELHOR_ENVIO_USER_AGENT: "ProxyBembem (contato@proxybembem.com.br)",
  SHIPPING_ORIGIN_CEP: "86730-000",
  SHIPPING_QUOTE_SECRET: "q".repeat(64),
} as const

function withEnv(
  values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  run: () => void,
) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key])
    delete process.env[key]
  }

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value
  }

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

test("Vercel Preview may use Sandbox providers even when NODE_ENV is production", () => {
  withEnv({ ...baseEnv, NODE_ENV: "production", VERCEL_ENV: "preview" }, () => {
    assert.equal(getMercadoPagoEnv().mercadoPagoEnvironment, "sandbox")
    assert.equal(getMelhorEnvioEnv().environment, "sandbox")
  })
})

test("Vercel Production rejects Mercado Pago Sandbox", () => {
  withEnv(
    {
      ...baseEnv,
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      MERCADO_PAGO_ENVIRONMENT: "sandbox",
      MELHOR_ENVIO_ENVIRONMENT: "production",
    },
    () => {
      assert.throws(() => getMercadoPagoEnv(), /Production.*Mercado Pago.*production/i)
    },
  )
})

test("Vercel Production rejects Melhor Envio Sandbox", () => {
  withEnv(
    {
      ...baseEnv,
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      MERCADO_PAGO_ENVIRONMENT: "production",
      MELHOR_ENVIO_ENVIRONMENT: "sandbox",
    },
    () => {
      assert.throws(() => getMelhorEnvioEnv(), /Production.*Melhor Envio.*production/i)
    },
  )
})

test("non-Vercel production runtime also rejects Sandbox providers", () => {
  withEnv({ ...baseEnv, NODE_ENV: "production", VERCEL_ENV: undefined }, () => {
    assert.throws(() => getMercadoPagoEnv(), /Production.*Mercado Pago.*production/i)
    assert.throws(() => getMelhorEnvioEnv(), /Production.*Melhor Envio.*production/i)
  })
})

test("Production accepts both providers configured for production", () => {
  withEnv(
    {
      ...baseEnv,
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      MERCADO_PAGO_ENVIRONMENT: "production",
      MELHOR_ENVIO_ENVIRONMENT: "production",
    },
    () => {
      assert.equal(getMercadoPagoEnv().mercadoPagoEnvironment, "production")
      assert.equal(getMelhorEnvioEnv().environment, "production")
    },
  )
})
