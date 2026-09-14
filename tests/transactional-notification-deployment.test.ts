import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("environment example includes server-only Resend webhook signing secret", async () => {
  const text = await source(".env.example")
  assert.match(text, /^RESEND_API_KEY=$/m)
  assert.match(text, /^RESEND_WEBHOOK_SECRET=$/m)
  assert.doesNotMatch(text, /^NEXT_PUBLIC_RESEND_/m)
})

test("KingHost docs define the real five-minute GET cron contract with the existing maintenance secret", async () => {
  const text = await source("docs/deployment/kinghost.md")
  assert.match(text, /GET \/api\/internal\/notifications\/process/)
  assert.match(text, /também aceita POST/i)
  assert.match(text, /X-CRON-AUTH: <CRON_SECRET>/)
  assert.match(text, /a cada 5 minutos/i)
  assert.match(text, /https:\/\/www\.proxybembem\.com\.br\/api\/internal\/notifications\/process/)
})

test("KingHost docs define the real signed Resend webhook and explicitly disable open/click tracking", async () => {
  const text = await source("docs/deployment/kinghost.md")
  assert.match(text, /RESEND_WEBHOOK_SECRET/)
  assert.match(text, /https:\/\/www\.proxybembem\.com\.br\/api\/webhooks\/resend/)
  assert.match(text, /email\.sent/)
  assert.match(text, /email\.delivered/)
  assert.match(text, /email\.bounced/)
  assert.match(text, /email\.failed/)
  assert.match(text, /email\.suppressed/)
  assert.match(text, /não.*email\.opened/i)
  assert.match(text, /não.*email\.clicked/i)
  assert.match(text, /Open Tracking.*(?:OFF|desativad[oa])/i)
  assert.match(text, /Click Tracking.*(?:OFF|desativad[oa])/i)
})
