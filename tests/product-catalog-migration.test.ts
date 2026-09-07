import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

const migrationUrl = new URL(
  "../supabase/migrations/202609070001_product_catalog.sql",
  import.meta.url,
)

test("product catalog migration preserves ids lifecycle pricing and storage", () => {
  assert.equal(
    existsSync(migrationUrl),
    true,
    "product catalog migration must exist before the contract can pass",
  )

  const migration = readFileSync(migrationUrl, "utf8")

  assert.match(migration, /create table(?: if not exists)? public\.products/i)
  assert.match(migration, /status[\s\S]*?'draft'[\s\S]*?'published'[\s\S]*?'archived'/i)
  assert.match(migration, /original_price_cents/i)
  assert.match(migration, /price_cents/i)
  assert.match(migration, /updated_at/i)
  assert.match(migration, /insert into public\.products/i)
  assert.match(migration, /\(\s*1\s*,/)
  assert.match(migration, /\(\s*2\s*,/)
  assert.match(migration, /product-images/i)
  assert.match(migration, /storage\.buckets/i)
})
