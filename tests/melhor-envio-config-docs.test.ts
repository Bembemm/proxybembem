import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const LEGACY_TOKEN_NAME = ["MELHOR", "ENVIO", "ACCESS", "TOKEN"].join("_")
const OBSOLETE_ADMIN_SECRET = ["MELHOR", "ENVIO", "OAUTH", "ADMIN", "SECRET"].join("_")
const FINAL_VARIABLES = [
  "MELHOR_ENVIO_ENVIRONMENT",
  "MELHOR_ENVIO_CLIENT_ID",
  "MELHOR_ENVIO_CLIENT_SECRET",
  "MELHOR_ENVIO_REDIRECT_URI",
  "MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY",
  "MELHOR_ENVIO_USER_AGENT",
  "SHIPPING_ORIGIN_CEP",
  "SHIPPING_QUOTE_SECRET",
  "CRON_SECRET",
] as const

test("environment example documents the final OAuth contract without obsolete token or admin-secret variables", async () => {
  const source = await readFile(new URL("../.env.example", import.meta.url), "utf8")

  for (const variable of FINAL_VARIABLES) {
    assert.match(source, new RegExp(`^${variable}=`, "m"), `${variable} must be documented`)
  }
  assert.equal(source.includes(LEGACY_TOKEN_NAME), false)
  assert.equal(source.includes(OBSOLETE_ADMIN_SECRET), false)
})

test("shipping setup documents authorization, automatic refresh and secret handling", async () => {
  const source = await readFile(new URL("../docs/shipping-setup.md", import.meta.url), "utf8")

  for (const expected of [
    "shipping-calculate",
    "/admin/integrations/melhor-envio",
    "/api/melhor-envio/oauth/callback",
    "refresh_token",
    "CRON_SECRET",
    "openssl rand -hex 32",
    "Sandbox",
    "Production",
  ]) {
    assert.ok(source.includes(expected), `shipping setup must include ${expected}`)
  }

  assert.equal(source.includes(LEGACY_TOKEN_NAME), false)
  assert.match(source, /nunca.*chat/i)
  assert.match(source, /reauthor/i)
})
