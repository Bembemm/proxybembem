import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = new URL(
  "../supabase/migrations/202609150002_phase9_customer_profiles_rls_performance.sql",
  import.meta.url,
)

test("customer profile policies use initplan-safe auth uid without changing grants", async () => {
  const sql = await readFile(migration, "utf8")

  for (const policy of [
    "customer_profiles_select_own",
    "customer_profiles_insert_own",
    "customer_profiles_update_own",
  ]) {
    assert.match(sql, new RegExp(`create\\s+policy\\s+${policy}`, "i"))
  }

  assert.match(sql, /\(select\s+auth\.uid\(\)\)\s*=\s*id/i)
  assert.doesNotMatch(sql, /grant\s+.*customer_profiles/i)
  assert.doesNotMatch(
    sql,
    /alter\s+table\s+public\.customer_profiles\s+disable\s+row\s+level\s+security/i,
  )
})
