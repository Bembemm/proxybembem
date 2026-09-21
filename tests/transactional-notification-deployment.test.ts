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

test("Vercel configuration defines the real five-minute notification cron", async () => {
  const [config, runbook] = await Promise.all([
    source("vercel.json"),
    source("docs/deployment/vercel.md"),
  ])

  assert.match(config, /\/api\/internal\/notifications\/process/)
  assert.match(config, /\*\/5 \* \* \* \*/)
  assert.match(runbook, /Authorization: Bearer <CRON_SECRET>/)
  assert.match(runbook, /every five minutes/i)
})

test("Vercel runbook defines the signed Resend webhook and disables open/click tracking", async () => {
  const text = await source("docs/deployment/vercel.md")
  assert.match(text, /RESEND_WEBHOOK_SECRET|Resend webhook/i)
  assert.match(text, /https:\/\/www\.proxybembem\.com\.br\/api\/webhooks\/resend/)
  assert.match(text, /email\.sent/)
  assert.match(text, /email\.delivered/)
  assert.match(text, /email\.bounced/)
  assert.match(text, /email\.failed/)
  assert.match(text, /email\.suppressed/)
  assert.match(text, /Do not subscribe to `email\.opened` or `email\.clicked`/i)
  assert.match(text, /Open Tracking.*OFF/i)
  assert.match(text, /Click Tracking.*OFF/i)
})
