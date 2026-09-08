import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

const repairMigrationUrl = new URL(
  "../supabase/migrations/202609070002_product_catalog_service_role_grants.sql",
  import.meta.url,
)
const leastPrivilegeMigrationUrl = new URL(
  "../supabase/migrations/202609080001_product_catalog_service_role_least_privilege.sql",
  import.meta.url,
)

test("product catalog repair migration grants the runtime read and mutation privileges", () => {
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

test("follow-up product catalog hardening removes inherited service-role privileges before regranting the minimum", () => {
  assert.equal(
    existsSync(leastPrivilegeMigrationUrl),
    true,
    "least-privilege product catalog migration must exist",
  )

  const migration = readFileSync(leastPrivilegeMigrationUrl, "utf8")

  assert.match(
    migration,
    /revoke\s+all\s+on\s+table\s+public\.products\s+from\s+service_role\s*;/i,
  )
  assert.match(
    migration,
    /grant\s+select\s*,\s*insert\s*,\s*update\s+on\s+table\s+public\.products\s+to\s+service_role\s*;/i,
  )
  assert.match(
    migration,
    /revoke\s+all\s+on\s+sequence\s+public\.products_id_seq\s+from\s+service_role\s*;/i,
  )
  assert.match(
    migration,
    /grant\s+usage\s+on\s+sequence\s+public\.products_id_seq\s+to\s+service_role\s*;/i,
  )
  assert.doesNotMatch(migration, /grant\s+all/i)
  assert.doesNotMatch(migration, /grant[\s\S]*delete[\s\S]*public\.products/i)
  assert.doesNotMatch(migration, /grant[\s\S]*truncate[\s\S]*public\.products/i)
  assert.doesNotMatch(migration, /grant[\s\S]*references[\s\S]*public\.products/i)
  assert.doesNotMatch(migration, /grant[\s\S]*trigger[\s\S]*public\.products/i)
})
