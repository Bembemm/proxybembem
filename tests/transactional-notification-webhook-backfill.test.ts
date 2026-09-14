import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609140002_transactional_notification_webhook_backfill.sql",
  import.meta.url,
)

test("backfills previously unlinked webhook events by trusted provider message id only", async () => {
  const sql = (await readFile(MIGRATION, "utf8").catch(() => "")).toLowerCase().replace(/\s+/g, " ")

  assert.match(sql, /update public\.notification_webhook_events/)
  assert.match(sql, /set notification_id = n\.id/)
  assert.match(sql, /from public\.notification_outbox n/)
  assert.match(sql, /e\.notification_id is null/)
  assert.match(sql, /n\.provider_message_id = e\.provider_message_id/)
  assert.doesNotMatch(sql, /recipient_email|customer_email/)
})
