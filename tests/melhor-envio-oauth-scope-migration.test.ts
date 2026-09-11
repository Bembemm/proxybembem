import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609080002_melhor_envio_oauth_scope_grants.sql",
  import.meta.url,
)

function functionBlock(sql: string, name: string) {
  const start = sql.indexOf(`function public.${name}`)
  assert.ok(start >= 0, `missing ${name}`)
  const next = sql.indexOf("function public.", start + 1)
  return sql.slice(start, next >= 0 ? next : undefined)
}

test("scope migration records legacy credentials as quote-only instead of pretending they gained permissions", () => {
  assert.equal(existsSync(MIGRATION), true, "scope migration must exist")
  const sql = readFileSync(MIGRATION, "utf8").toLowerCase()

  assert.match(
    sql,
    /add\s+column\s+if\s+not\s+exists\s+authorized_scopes\s+text\[\]\s+not\s+null\s+default\s+array\s*\[\s*'shipping-calculate'\s*\](?:::text\[\])?/,
  )
  assert.match(sql, /check\s*\(\s*public\.is_valid_melhor_envio_scope_array\s*\(\s*authorized_scopes\s*\)\s*\)/)

  const legacy = functionBlock(sql, "upsert_melhor_envio_authorized_credential")
  assert.match(legacy, /authorized_scopes/)
  assert.match(legacy, /array\s*\[\s*'shipping-calculate'\s*\]/)
  assert.doesNotMatch(legacy, /p_authorized_scopes/)
})

test("scope validation is bounded duplicate-free and restricted to the approved Phase 5 names", () => {
  const sql = readFileSync(MIGRATION, "utf8").toLowerCase()
  const validator = functionBlock(sql, "is_valid_melhor_envio_scope_array")

  assert.match(validator, /immutable/)
  assert.match(validator, /cardinality\s*\(\s*p_scopes\s*\)/)
  assert.match(validator, /count\s*\(\s*distinct/)

  for (const scope of [
    "shipping-calculate",
    "cart-read",
    "cart-write",
    "orders-read",
    "shipping-checkout",
    "shipping-generate",
    "shipping-print",
    "shipping-tracking",
    "shipping-cancel",
  ]) {
    assert.ok(validator.includes(`'${scope}'`), `validator must allow ${scope}`)
  }
})

test("v2 authorization upsert atomically stores the exact authorized scope set and stays service-role only", () => {
  const sql = readFileSync(MIGRATION, "utf8").toLowerCase()
  const block = functionBlock(sql, "upsert_melhor_envio_authorized_credential_v2")

  assert.match(block, /p_authorized_scopes\s+text\[\]/)
  assert.match(block, /security\s+definer/)
  assert.match(block, /set\s+search_path\s*=\s*''/)
  assert.match(block, /is_valid_melhor_envio_scope_array\s*\(\s*p_authorized_scopes\s*\)/)
  assert.match(block, /authorized_scopes\s*=\s*p_authorized_scopes/)
  assert.match(block, /token_version\s*=\s*[a-z_][a-z0-9_]*\.token_version\s*\+\s*1/)

  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.upsert_melhor_envio_authorized_credential_v2\([\s\S]*?\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/,
  )
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.upsert_melhor_envio_authorized_credential_v2\([\s\S]*?\)\s+to\s+service_role/,
  )
})

test("token refresh RPCs preserve authorized scopes rather than changing permissions", () => {
  const sql = readFileSync(MIGRATION, "utf8").toLowerCase()

  for (const name of [
    "claim_melhor_envio_refresh_lease",
    "commit_melhor_envio_refresh",
    "release_melhor_envio_refresh_lease",
    "mark_melhor_envio_reauthorization_required",
  ]) {
    const marker = `function public.${name}`
    if (!sql.includes(marker)) continue
    const block = functionBlock(sql, name)
    assert.doesNotMatch(block, /authorized_scopes\s*=/, `${name} must preserve scopes`)
  }
})
