import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609120004_transactional_notification_webhook_reconciliation.sql",
  import.meta.url,
)

async function sql() {
  return (await readFile(MIGRATION, "utf8").catch(() => "")).toLowerCase()
}

test("serializes and reconciles Resend webhooks that race provider_message_id persistence", async () => {
  const text = await sql()

  assert.match(text, /create\s+or\s+replace\s+function\s+public\.complete_notification_attempt/)
  assert.match(text, /create\s+or\s+replace\s+function\s+public\.record_notification_webhook/)
  assert.match(text, /p_outcome\s*=\s*'accepted'/)
  assert.match(text, /provider_message_id\s*=\s*p_provider_message_id/)

  const advisoryLocks = text.match(
    /pg_catalog\.pg_advisory_xact_lock\s*\(\s*pg_catalog\.hashtextextended\s*\(\s*p_provider_message_id\s*,\s*0\s*\)\s*\)/g,
  )
  assert.equal(advisoryLocks?.length, 2, "both completion and webhook persistence must take the same transaction lock")

  assert.match(
    text,
    /update\s+public\.notification_webhook_events[\s\S]*set\s+notification_id\s*=\s*v_row\.id[\s\S]*provider_message_id\s*=\s*p_provider_message_id[\s\S]*notification_id\s+is\s+null/,
  )

  assert.match(text, /event_type\s*=\s*'email\.delivered'/)
  assert.match(text, /event_type\s*=\s*'email\.bounced'/)
  assert.match(text, /event_type\s+in\s*\(\s*'email\.failed'\s*,\s*'email\.suppressed'\s*\)/)

  const delivered = text.indexOf("if v_early_delivered_at is not null")
  const bounced = text.indexOf("elsif v_early_bounced_at is not null")
  const failed = text.indexOf("elsif v_early_failed_at is not null")
  assert.ok(delivered >= 0, "missing delivered reconciliation")
  assert.ok(bounced > delivered, "bounced must be lower precedence than delivered")
  assert.ok(failed > bounced, "failed/suppressed must be lower precedence than bounced")

  assert.match(text, /status\s*=\s*'delivered'/)
  assert.match(text, /status\s*=\s*'bounced'/)
  assert.match(text, /status\s*=\s*'failed'/)
  assert.match(text, /delivered_at\s*=\s*coalesce\(delivered_at,\s*v_early_delivered_at\)/)
  assert.match(text, /bounced_at\s*=\s*coalesce\(bounced_at,\s*v_early_bounced_at\)/)
  assert.match(text, /failed_at\s*=\s*coalesce\(failed_at,\s*v_early_failed_at\)/)

  assert.match(
    text,
    /revoke\s+all\s+on\s+function\s+public\.complete_notification_attempt\(uuid,\s*uuid,\s*text,\s*text,\s*text\)[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/,
  )
  assert.match(
    text,
    /grant\s+execute\s+on\s+function\s+public\.complete_notification_attempt\(uuid,\s*uuid,\s*text,\s*text,\s*text\)[\s\S]*to\s+service_role/,
  )
  assert.match(
    text,
    /revoke\s+all\s+on\s+function\s+public\.record_notification_webhook\(text,\s*text,\s*text\)[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/,
  )
  assert.match(
    text,
    /grant\s+execute\s+on\s+function\s+public\.record_notification_webhook\(text,\s*text,\s*text\)[\s\S]*to\s+service_role/,
  )
})
