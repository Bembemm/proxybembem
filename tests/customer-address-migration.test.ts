import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function migrations() {
  const dir = new URL("../supabase/migrations/", import.meta.url)
  const { readdir } = await import("node:fs/promises")
  const names = (await readdir(dir)).filter((name) => name.includes("customer_addresses"))
  assert.equal(names.length, 1)
  return readFile(new URL(names[0], dir), "utf8")
}

test("customer addresses migration is owner-scoped with bounded defaults", async () => {
  const sql = await migrations()

  assert.match(sql, /create table[^;]*public\.customer_addresses/is)
  assert.match(sql, /customer_id\s+uuid\s+not null\s+references\s+auth\.users\s*\(\s*id\s*\)\s+on delete cascade/i)
  assert.match(sql, /alter table\s+public\.customer_addresses\s+enable row level security/i)
  assert.match(sql, /grant\s+select,\s*insert,\s*update,\s*delete\s+on table\s+public\.customer_addresses\s+to\s+authenticated/i)
  assert.match(sql, /revoke all on table\s+public\.customer_addresses\s+from\s+public,\s*anon,\s*authenticated/i)
  assert.match(sql, /using\s*\(\s*\(select auth\.uid\(\)\)\s*=\s*customer_id\s*\)/i)
  assert.match(sql, /with check\s*\(\s*\(select auth\.uid\(\)\)\s*=\s*customer_id\s*\)/i)
  assert.match(sql, /create unique index[^;]*customer_id[^;]*where\s+is_default/is)
  assert.match(sql, /cep[^;]*\^\\d\{8\}\$/i)
  assert.match(sql, /state[^;]*\^\[A-Z\]\{2\}\$/i)
})
