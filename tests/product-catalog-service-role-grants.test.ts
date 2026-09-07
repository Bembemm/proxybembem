import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

const repairMigrationUrl = new URL(
  "../supabase/migrations/202609070002_product_catalog_service_role_grants.sql",
  import.meta.url,
)

test("product catalog grants only the backend privileges needed for runtime reads and mutations", () => {
  assert.equal(
    existsSync(repairMigrationUrl),
    true,
    "product catalog service-role grant repair migration must exist",
  )

  const migration = readFileSync(repairMigrationUrl, "utf8")

  assert.match(
    migration,
    /grant\s+select\s*,\s*insert\s*,\s*update\s+on\s+table\s+public\.products\s+to\s+service_role\s*;/i,
  )
  assert.match(
    migration,
    /grant\s+usage\s+on\s+sequence\s+public\.products_id_seq\s+to\s+service_role\s*;/i,
  )
  assert.match(
    migration,
    /revoke\s+all\s+on\s+table\s+public\.products\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i,
  )
  assert.doesNotMatch(migration, /grant\s+all\s+on\s+table\s+public\.products/i)
  assert.doesNotMatch(migration, /grant[\s\S]*delete[\s\S]*public\.products/i)
})
