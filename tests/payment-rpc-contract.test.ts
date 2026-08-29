import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202608280003_atomic_payment_events.sql",
  import.meta.url,
)

test("atomic payment migration preserves critical concurrency and authorization invariants", async () => {
  const sql = (await readFile(MIGRATION, "utf8")).toLowerCase()

  assert.match(sql, /for\s+update/)
  assert.match(sql, /security\s+definer/)
  assert.match(sql, /set\s+search_path\s*=\s*''/)
  assert.match(sql, /coalesce\s*\(\s*[^,]*total_cents\s*,\s*[^)]*subtotal_cents\s*\)/)
  assert.match(sql, /approved/)
  assert.match(sql, /refunded/)
  assert.match(sql, /charged_back/)
  assert.match(sql, /manual_review/)
  assert.match(sql, /orders_payment_id_uidx/)
  assert.match(sql, /where\s+payment_id\s+is\s+not\s+null/)
  assert.match(sql, /revoke\s+all\s+on\s+function[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/)
  assert.match(sql, /grant\s+execute\s+on\s+function[\s\S]*to\s+service_role/)
})

test("atomic payment migration aborts before the unique index when duplicate payment ids exist", async () => {
  const sql = (await readFile(MIGRATION, "utf8")).toLowerCase()
  const guardPosition = sql.indexOf("duplicate payment_id")
  const indexPosition = sql.indexOf("create unique index if not exists orders_payment_id_uidx")

  assert.ok(guardPosition >= 0, "expected an executable duplicate payment_id guard")
  assert.ok(indexPosition >= 0, "expected the payment_id unique index")
  assert.ok(guardPosition < indexPosition, "duplicate guard must run before the unique index")
  assert.match(
    sql,
    /if\s+exists\s*\([\s\S]*group\s+by\s+payment_id[\s\S]*having\s+count\s*\(\s*\*\s*\)\s*>\s*1[\s\S]*raise\s+exception/,
  )
})
