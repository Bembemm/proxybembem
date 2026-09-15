import assert from "node:assert/strict"
import test from "node:test"
import { getMelhorEnvioEnv, getMercadoPagoEnv } from "../lib/server/env.ts"

const ENV_KEYS = [
  "NODE_ENV",
  "APP_ENVIRONMENT",
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
  const env = process.env as Record<string, string | undefined>
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) {
    previous.set(key, env[key])
    delete env[key]
  }

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) env[key] = value
  }

  try {
    run()
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete env[key]
      else env[key] = value
    }
  }
}

test("non-production runtime may use sandbox providers", () => {
  withEnv({ ...baseEnv, NODE_ENV: "development" }, () => {
    assert.equal(getMercadoPagoEnv().mercadoPagoEnvironment, "sandbox")
    assert.equal(getMelhorEnvioEnv().environment, "sandbox")
  })
})

test("production runtime may use sandbox providers only in an explicit sandbox deployment", () => {
  withEnv(
    {
      ...baseEnv,
      NODE_ENV: "production",
      APP_ENVIRONMENT: "sandbox",
    },
    () => {
      assert.equal(getMercadoPagoEnv().mercadoPagoEnvironment, "sandbox")
      assert.equal(getMelhorEnvioEnv().environment, "sandbox")
    },
  )
})

test("production runtime rejects Mercado Pago sandbox", () => {
  withEnv(
    {
      ...baseEnv,
      NODE_ENV: "production",
      MERCADO_PAGO_ENVIRONMENT: "sandbox",
      MELHOR_ENVIO_ENVIRONMENT: "production",
    },
    () => {
      assert.throws(() => getMercadoPagoEnv(), /Production.*Mercado Pago.*production/i)
    },
  )
})

test("production runtime rejects Melhor Envio sandbox", () => {
  withEnv(
    {
      ...baseEnv,
      NODE_ENV: "production",
      MERCADO_PAGO_ENVIRONMENT: "production",
      MELHOR_ENVIO_ENVIRONMENT: "sandbox",
    },
    () => {
      assert.throws(() => getMelhorEnvioEnv(), /Production.*Melhor Envio.*production/i)
    },
  )
})

test("production runtime accepts both providers configured for production", () => {
  withEnv(
    {
      ...baseEnv,
      NODE_ENV: "production",
      MERCADO_PAGO_ENVIRONMENT: "production",
      MELHOR_ENVIO_ENVIRONMENT: "production",
    },
    () => {
      assert.equal(getMercadoPagoEnv().mercadoPagoEnvironment, "production")
      assert.equal(getMelhorEnvioEnv().environment, "production")
    },
  )
})
