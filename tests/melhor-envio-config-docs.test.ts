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

test("shipping setup documents prepare-only OAuth and direct handoff to Melhor Envio", async () => {
  const source = await readFile(new URL("../docs/shipping-setup.md", import.meta.url), "utf8")

  for (const expected of [
    "shipping-calculate",
    "cart-write",
    "/admin/integrations/melhor-envio",
    "/api/melhor-envio/oauth/callback",
    "CRON_SECRET",
    "Sandbox",
    "Production",
    "Preparar remessa",
    "Marcar enviado",
  ]) {
    assert.ok(source.includes(expected), `shipping setup must include ${expected}`)
  }

  assert.equal(source.includes(LEGACY_TOKEN_NAME), false)
  assert.equal(source.includes(OBSOLETE_ADMIN_SECRET), false)
  assert.doesNotMatch(source, /MELHOR_ENVIO_LABEL_PURCHASE_ENABLED/)
  assert.doesNotMatch(
    source,
    /shipping-checkout|shipping-generate|shipping-print|shipping-tracking|shipping-cancel/,
  )
  assert.match(source, /reautoriz/i)
  assert.match(source, /n[aã]o compra etiquetas/i)
})

test("production rollout pins the canonical callback and isolates sandbox and production credentials", async () => {
  const source = await readFile(new URL("../docs/shipping-setup.md", import.meta.url), "utf8")

  assert.ok(
    source.includes("https://www.proxybembem.com.br/api/melhor-envio/oauth/callback"),
    "Production callback must be documented exactly",
  )
  assert.match(source, /Sandbox[^
]*Production[^
]*credenciais pr[oó]prias|Production[^
]*Sandbox[^
]*credenciais pr[oó]prias/i)
  assert.match(source, /MELHOR_ENVIO_ENVIRONMENT=production/)
  assert.match(source, /SHIPPING_ORIGIN_CEP/)
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

  assert.match(source, /n[aã]o use[^
]*Supabase[^
]*Production/i)
  assert.match(source, /n[aã]o copie[^
]*(?:credenciais|segredos)[^
]*Production/i)
  assert.match(source, /aplica[cç][aã]o[^
]*KingHost[^
]*separad/i)
})
