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
  "MELHOR_ENVIO_LABEL_PURCHASE_ENABLED",
] as const

async function withEnv(
  labelPurchaseEnabled: string | undefined,
  run: () => Promise<void>,
) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])

  process.env.MELHOR_ENVIO_ENVIRONMENT = "sandbox"
  process.env.MELHOR_ENVIO_CLIENT_ID = "12345"
  process.env.MELHOR_ENVIO_CLIENT_SECRET = "client-secret"
  process.env.MELHOR_ENVIO_REDIRECT_URI =
    "https://preview.example/api/melhor-envio/oauth/callback"
  process.env.MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY = "a".repeat(64)
  process.env.MELHOR_ENVIO_USER_AGENT = "ProxyBembem (contato@proxybembem.com.br)"
  process.env.SHIPPING_ORIGIN_CEP = "86730000"
  process.env.SHIPPING_QUOTE_SECRET = "q".repeat(64)
  if (labelPurchaseEnabled === undefined) {
    delete process.env.MELHOR_ENVIO_LABEL_PURCHASE_ENABLED
  } else {
    process.env.MELHOR_ENVIO_LABEL_PURCHASE_ENABLED = labelPurchaseEnabled
  }

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

async function loadEnv() {
  return import("../lib/server/env.ts")
}

test("label purchase stays disabled when the flag is missing blank or explicitly false", async () => {
  const { getMelhorEnvioShipmentEnv } = await loadEnv()

  for (const value of [undefined, "", "   ", "false"] as const) {
    await withEnv(value, async () => {
      const env = getMelhorEnvioShipmentEnv()
      assert.equal(env.environment, "sandbox")
      assert.equal(env.labelPurchaseEnabled, false)
    })
  }
})

test("only the exact true literal enables label purchase", async () => {
  const { getMelhorEnvioShipmentEnv } = await loadEnv()

  await withEnv("true", async () => {
    assert.equal(getMelhorEnvioShipmentEnv().labelPurchaseEnabled, true)
  })
})

test("arbitrary truthy-looking purchase flag values fail closed as configuration errors", async () => {
  const { getMelhorEnvioShipmentEnv } = await loadEnv()

  for (const value of ["TRUE", "1", "yes", "on"] as const) {
    await withEnv(value, async () => {
      assert.throws(
        () => getMelhorEnvioShipmentEnv(),
        /MELHOR_ENVIO_LABEL_PURCHASE_ENABLED must be true or false/,
      )
    })
  }
})
