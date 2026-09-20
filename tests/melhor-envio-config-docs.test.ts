import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const LEGACY_TOKEN_NAME = ["MELHOR", "ENVIO", "ACCESS", "TOKEN"].join("_")
const OBSOLETE_ADMIN_SECRET = ["MELHOR", "ENVIO", "OAUTH", "ADMIN", "SECRET"].join("_")
const FINAL_VARIABLES = [
  "APP_ENVIRONMENT",
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

test("environment example documents the prepare-only OAuth contract without obsolete spending flags or secrets", async () => {
  const source = await readFile(new URL("../.env.example", import.meta.url), "utf8")

  for (const variable of FINAL_VARIABLES) {
    assert.match(source, new RegExp(`^${variable}=`, "m"), `${variable} must be documented`)
  }
  assert.match(source, /^APP_ENVIRONMENT=sandbox$/m)
  assert.equal(source.includes(LEGACY_TOKEN_NAME), false)
  assert.equal(source.includes(OBSOLETE_ADMIN_SECRET), false)
  assert.doesNotMatch(source, /MELHOR_ENVIO_LABEL_PURCHASE_ENABLED/)
})

test("shipping setup documents authorization, automatic refresh and MFA admin handling", async () => {
  const source = await readFile(new URL("../docs/shipping-setup.md", import.meta.url), "utf8")

  for (const expected of [
    "shipping-calculate",
    "/admin/login",
    "/admin/integrations/melhor-envio",
    "/api/melhor-envio/oauth/callback",
    "Authenticator",
    "30 minutos",
    "refresh_token",
    "CRON_SECRET",
    "openssl rand -hex 32",
    "Sandbox",
    "Production",
    "Supabase",
  ]) {
    assert.ok(source.includes(expected), `shipping setup must include ${expected}`)
  }

  assert.equal(source.includes(LEGACY_TOKEN_NAME), false)
  assert.equal(source.includes(OBSOLETE_ADMIN_SECRET), false)
  assert.match(source, /recupera[^\n]*Supabase|Supabase[^\n]*recupera/i)
  assert.match(source, /nunca.*chat/i)
  assert.match(source, /reauthor/i)
})

test("production rollout pins the canonical callback and keeps provider credentials isolated", async () => {
  const source = await readFile(new URL("../docs/shipping-setup.md", import.meta.url), "utf8")

  assert.ok(
    source.includes("https://www.proxybembem.com.br/api/melhor-envio/oauth/callback"),
    "Production callback must be documented exactly",
  )
  assert.match(source, /aplicativo[^\n]*Production[^\n]*separad|Production[^\n]*aplicativo[^\n]*separad/i)
  assert.match(source, /segredos?[^\n]*Production[^\n]*(pr[oó]pri|independent)|Production[^\n]*segredos?[^\n]*(pr[oó]pri|independent)/i)
  assert.match(source, /(?:IDs?|servi[cç]os?)[^\n]*1[^\n]*2[^\n]*(?:PAC|SEDEX)|(?:PAC|SEDEX)[^\n]*1[^\n]*2/i)
  assert.match(source, /n[aã]o (?:reutilize|copie)[^\n]*(?:Client ID|Client Secret|segredo|credencial)/i)
})

test("KingHost sandbox runbook isolates provider credentials and production data", async () => {
  const source = await readFile(
    new URL("../docs/deployment/kinghost-sandbox.md", import.meta.url),
    "utf8",
  )

  for (const expected of [
    "sandbox/kinghost-mercadopago-melhor-envio",
    "APP_ENVIRONMENT=sandbox",
    "MERCADO_PAGO_ENVIRONMENT=sandbox",
    "MELHOR_ENVIO_ENVIRONMENT=sandbox",
    "/api/melhor-envio/oauth/callback",
    "/api/mercadopago/webhook",
    "Supabase",
  ]) {
    assert.ok(source.includes(expected), `sandbox runbook must include ${expected}`)
  }

  assert.match(source, /n[aã]o use[^\n]*Supabase[^\n]*Production/i)
  assert.match(source, /n[aã]o copie[^\n]*(?:credenciais|segredos)[^\n]*Production/i)
  assert.match(source, /aplica[cç][aã]o[^\n]*KingHost[^\n]*separad/i)
})
