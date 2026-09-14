import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("settings page authenticates before authoritative read and uses the settings admin section", async () => {
  const page = await source("../app/admin/configuracoes/page.tsx")

  assert.ok(page.length > 0, "missing protected store settings page")
  assert.match(page, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/)
  assert.match(page, /requireAdminPageAccess\(\{\s*touch:\s*true\s*\}\)/)
  assert.match(page, /getAdminStoreSettings\(\)/)
  assert.ok(
    page.indexOf("requireAdminPageAccess") < page.indexOf("getAdminStoreSettings()"),
    "admin access must be required before reading store settings",
  )
  assert.match(page, /<AdminShell[\s\S]*activeSection=["']settings["']/)
  assert.match(page, /<StoreSettingsForm\b/)
})

test("settings page fails closed when the authoritative backend read is unavailable", async () => {
  const page = await source("../app/admin/configuracoes/page.tsx")

  assert.match(page, /try\s*\{/)
  assert.match(page, /catch\s*\{/)
  assert.match(page, /Não foi possível carregar as configurações|Configurações indisponíveis/i)
  assert.match(page, /Tente novamente|recarregue/i)
  assert.doesNotMatch(page, /DEFAULT_PUBLIC_STORE_SETTINGS/)
})

test("settings form exposes the exact V1 groups and bounded fields", async () => {
  const form = await source("../components/admin/settings/store-settings-form.tsx")

  assert.ok(form.length > 0, "missing store settings form")
  assert.match(form, /^["']use client["']/m)
  assert.match(form, />\s*Operação\s*</)
  assert.match(form, />\s*Contato\s*</)
  assert.match(form, />\s*Aviso da loja\s*</)
  assert.match(form, /type=["']number["']/)
  assert.match(form, /min=\{?1\}?/)
  assert.match(form, /max=\{?15\}?/)
  assert.match(form, /type=["']email["']/)
  assert.match(form, /maxLength=\{254\}/)
  assert.match(form, /E\.164/)
  assert.match(form, /\+55/)
  assert.match(form, /maxLength=\{400\}/)
  assert.match(form, /Salvar configurações/)
  assert.doesNotMatch(form, /autosave|autoSave/i)
})

test("settings form PATCHes only the revision plus the five V1 values", async () => {
  const form = await source("../components/admin/settings/store-settings-form.tsx")

  assert.match(form, /fetch\(\s*["']\/api\/admin\/settings["']/)
  assert.match(form, /method:\s*["']PATCH["']/)
  assert.match(form, /credentials:\s*["']same-origin["']/)
  assert.match(form, /expectedUpdatedAt/)
  for (const key of [
    "productionLeadTimeBusinessDays",
    "contactEmail",
    "contactWhatsappE164",
    "noticeEnabled",
    "noticeText",
  ]) {
    assert.match(form, new RegExp(`\\b${key}\\b`))
  }
  assert.doesNotMatch(form, /mercadoPago|resendApi|melhorEnvio|supabaseSecret|cronSecret/i)
})

test("settings form renders validation and conflict feedback without blind reload", async () => {
  const form = await source("../components/admin/settings/store-settings-form.tsx")

  assert.match(form, /response\.status\s*===\s*400/)
  assert.match(form, /fieldErrors/)
  assert.match(form, /response\.status\s*===\s*409/)
  assert.match(form, /store_settings_conflict/)
  assert.match(form, /alterad[oa] em outra sessão[^"']*recarregue/i)
  assert.doesNotMatch(form, /window\.location\.reload/)
})

test("successful save advances optimistic revision and clears dirty state", async () => {
  const form = await source("../components/admin/settings/store-settings-form.tsx")

  assert.match(form, /setExpectedUpdatedAt\([^)]*updatedAt[^)]*\)/)
  assert.match(form, /setDirty\(false\)/)
  assert.match(form, /beforeunload/)
  assert.match(form, /setSuccess\(/)
})
