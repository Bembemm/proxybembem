import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609140003_store_settings.sql",
  import.meta.url,
)

async function sql() {
  return (await readFile(MIGRATION, "utf8").catch(() => "")).toLowerCase()
}

function functionBlock(text: string) {
  const start = text.indexOf("function public.admin_update_store_settings")
  assert.ok(start >= 0, "missing admin_update_store_settings function")
  return text.slice(start)
}

test("defines a typed private singleton store settings row", async () => {
  const text = await sql()

  assert.match(text, /create\s+table(?:\s+if\s+not\s+exists)?\s+public\.store_settings/)
  assert.match(text, /id\s+text[^,]+primary\s+key/)
  assert.match(text, /id\s*=\s*'default'/)
  assert.match(text, /production_lead_time_business_days\s+integer\s+not\s+null\s+default\s+5/)
  assert.match(text, /production_lead_time_business_days\s+between\s+1\s+and\s+15/)
  assert.match(text, /contact_email\s+text/)
  assert.match(text, /contact_whatsapp_e164\s+text/)
  assert.match(text, /notice_enabled\s+boolean\s+not\s+null\s+default\s+false/)
  assert.match(text, /notice_text\s+text/)
  assert.match(text, /updated_at\s+timestamptz/)
  assert.match(text, /254/)
  assert.match(text, /400/)
  assert.match(text, /\^\\\+\[1-9\]\[0-9\]\{7,14\}\$/)
  assert.match(text, /notice_enabled[^;]+notice_text/s)
})

test("seeds the existing public contact values without introducing provider secrets", async () => {
  const text = await sql()

  assert.match(text, /insert\s+into\s+public\.store_settings/)
  assert.match(text, /'default'/)
  assert.match(text, /'contato@proxybembem\.com\.br'/)
  assert.match(text, /'\+5544991250332'/)
  assert.match(text, /false/)

  for (const secretName of [
    "mercado_pago_access_token",
    "resend_api_key",
    "melhor_envio_client_secret",
    "supabase_secret_key",
    "cron_secret",
  ]) {
    assert.equal(text.includes(secretName), false, `${secretName} must not become a store setting`)
  }
})

test("keeps store settings private from browser roles", async () => {
  const text = await sql()

  assert.match(text, /alter\s+table\s+public\.store_settings\s+enable\s+row\s+level\s+security/)
  assert.match(
    text,
    /revoke\s+all\s+on\s+table\s+public\.store_settings\s+from\s+public\s*,\s*anon\s*,\s*authenticated/,
  )
  assert.doesNotMatch(
    text,
    /grant\s+(?:select|insert|update|delete|all)[^;]+(?:on\s+table\s+)?public\.store_settings[^;]+to\s+(?:anon|authenticated)/,
  )
})

test("updates settings atomically with optimistic concurrency and an audit row", async () => {
  const text = await sql()
  const block = functionBlock(text)

  assert.match(block, /security\s+definer/)
  assert.match(block, /set\s+search_path\s*=\s*''/)
  assert.match(block, /for\s+update/)
  assert.match(block, /p_expected_updated_at/)
  assert.match(block, /'conflict'/)
  assert.match(block, /update\s+public\.store_settings/)
  assert.match(block, /insert\s+into\s+public\.admin_audit_log/)
  assert.match(block, /'store_settings'/)
  assert.match(block, /'default'/)
  assert.match(block, /'update_store_settings'/)
  assert.match(block, /previous_values/)
  assert.match(block, /new_values/)
  assert.match(block, /'updated'/)

  for (const field of [
    "production_lead_time_business_days",
    "contact_email",
    "contact_whatsapp_e164",
    "notice_enabled",
    "notice_text",
  ]) {
    assert.match(block, new RegExp(field))
  }

  assert.match(
    text,
    /revoke\s+all\s+on\s+function\s+public\.admin_update_store_settings\([^;]+\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/,
  )
  assert.match(
    text,
    /grant\s+execute\s+on\s+function\s+public\.admin_update_store_settings\([^;]+\)\s+to\s+service_role/,
  )
})
