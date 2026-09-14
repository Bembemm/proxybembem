import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609120003_transactional_notification_advisor_indexes.sql",
  import.meta.url,
)

test("covers the notification webhook notification_id foreign key with an index", async () => {
  const sql = await readFile(MIGRATION, "utf8").catch(() => "")

  assert.match(
    sql,
    /create\s+index\s+if\s+not\s+exists\s+notification_webhook_events_notification_id_idx\s+on\s+public\.notification_webhook_events\s*\(\s*notification_id\s*\)/i,
  )
})
