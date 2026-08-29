import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202608290002_melhor_envio_oauth.sql",
  import.meta.url,
)

const RPC_SIGNATURES = [
  "consume_melhor_envio_oauth_state",
  "upsert_melhor_envio_authorized_credential",
  "claim_melhor_envio_refresh_lease",
  "commit_melhor_envio_refresh",
  "release_melhor_envio_refresh_lease",
  "mark_melhor_envio_reauthorization_required",
] as const

test("Melhor Envio OAuth migration creates backend-only RLS tables with fail-closed constraints", async () => {
  const sql = (await readFile(MIGRATION, "utf8")).toLowerCase()

  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.melhor_envio_oauth_credentials/)
  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.melhor_envio_oauth_states/)
  assert.match(sql, /check\s*\(\s*environment\s+in\s*\(\s*'sandbox'\s*,\s*'production'\s*\)\s*\)/)
  assert.match(sql, /check\s*\(\s*status\s+in\s*\(\s*'active'\s*,\s*'reauthorization_required'\s*\)\s*\)/)
  assert.match(sql, /check\s*\(\s*token_version\s*>\s*0\s*\)/)
  assert.match(sql, /check\s*\(\s*char_length\s*\(\s*state_hash\s*\)\s*=\s*64\s*\)/)
  assert.match(sql, /alter\s+table\s+public\.melhor_envio_oauth_credentials\s+enable\s+row\s+level\s+security/)
  assert.match(sql, /alter\s+table\s+public\.melhor_envio_oauth_states\s+enable\s+row\s+level\s+security/)
  assert.match(sql, /revoke\s+all\s+on\s+table\s+public\.melhor_envio_oauth_credentials\s+from\s+public\s*,\s*anon\s*,\s*authenticated/)
  assert.match(sql, /revoke\s+all\s+on\s+table\s+public\.melhor_envio_oauth_states\s+from\s+public\s*,\s*anon\s*,\s*authenticated/)
  assert.match(sql, /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete\s+on\s+table\s+public\.melhor_envio_oauth_credentials\s+to\s+service_role/)
  assert.match(sql, /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete\s+on\s+table\s+public\.melhor_envio_oauth_states\s+to\s+service_role/)
})

test("all Melhor Envio OAuth mutation RPCs are security-definer, fixed-search-path and service-role only", async () => {
  const sql = (await readFile(MIGRATION, "utf8")).toLowerCase()

  for (const name of RPC_SIGNATURES) {
    const functionStart = sql.indexOf(`function public.${name}`)
    assert.ok(functionStart >= 0, `missing ${name}`)

    const nextFunction = sql.indexOf("function public.", functionStart + 1)
    const block = sql.slice(functionStart, nextFunction >= 0 ? nextFunction : undefined)
    assert.match(block, /security\s+definer/, `${name} must be SECURITY DEFINER`)
    assert.match(block, /set\s+search_path\s*=\s*''/, `${name} must fix search_path`)
  }

  for (const name of RPC_SIGNATURES) {
    assert.match(
      sql,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\([\\s\\S]*?\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`),
      `${name} execute must be revoked from browser-facing roles`,
    )
    assert.match(
      sql,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\([\\s\\S]*?\\)\\s+to\\s+service_role`),
      `${name} execute must be granted only to service_role`,
    )
  }
})

test("OAuth state consumption is atomic, one-shot and time bounded", async () => {
  const sql = (await readFile(MIGRATION, "utf8")).toLowerCase()
  const start = sql.indexOf("function public.consume_melhor_envio_oauth_state")
  const end = sql.indexOf("function public.", start + 1)
  const block = sql.slice(start, end)

  assert.match(block, /update\s+public\.melhor_envio_oauth_states/)
  assert.match(block, /consumed_at\s+is\s+null/)
  assert.match(block, /expires_at\s*>\s*now\s*\(\s*\)/)
  assert.match(block, /set\s+consumed_at\s*=\s*now\s*\(\s*\)/)
  assert.match(block, /get\s+diagnostics[\s\S]*row_count/)
})

test("initial authorization is an atomic upsert that advances token version and clears stale refresh state", async () => {
  const sql = (await readFile(MIGRATION, "utf8")).toLowerCase()
  const start = sql.indexOf("function public.upsert_melhor_envio_authorized_credential")
  const end = sql.indexOf("function public.", start + 1)
  const block = sql.slice(start, end)

  assert.match(block, /insert\s+into\s+public\.melhor_envio_oauth_credentials/)
  assert.match(block, /on\s+conflict\s*\(\s*environment\s*\)\s+do\s+update/)
  assert.match(block, /token_version\s*=\s*[a-z_][a-z0-9_]*\.token_version\s*\+\s*1/)
  assert.match(block, /refresh_lease_owner\s*=\s*null/)
  assert.match(block, /refresh_lease_expires_at\s*=\s*null/)
  assert.match(block, /status\s*=\s*'active'/)
})

test("refresh operations use lease ownership plus expected-version compare-and-set", async () => {
  const sql = (await readFile(MIGRATION, "utf8")).toLowerCase()

  const claimStart = sql.indexOf("function public.claim_melhor_envio_refresh_lease")
  const commitStart = sql.indexOf("function public.commit_melhor_envio_refresh")
  const releaseStart = sql.indexOf("function public.release_melhor_envio_refresh_lease")
  const reauthStart = sql.indexOf("function public.mark_melhor_envio_reauthorization_required")

  const claim = sql.slice(claimStart, commitStart)
  const commit = sql.slice(commitStart, releaseStart)
  const release = sql.slice(releaseStart, reauthStart)
  const reauth = sql.slice(reauthStart)

  assert.match(claim, /token_version\s*=\s*p_expected_version/)
  assert.match(claim, /refresh_lease_expires_at\s*<=\s*now\s*\(\s*\)/)
  assert.match(claim, /refresh_lease_owner\s*=\s*p_lease_owner/)

  assert.match(commit, /token_version\s*=\s*p_expected_version/)
  assert.match(commit, /refresh_lease_owner\s*=\s*p_lease_owner/)
  assert.match(commit, /refresh_lease_expires_at\s*>\s*now\s*\(\s*\)/)
  assert.match(commit, /token_version\s*=\s*token_version\s*\+\s*1/)
  assert.match(commit, /access_token_envelope\s*=\s*p_access_token_envelope/)
  assert.match(commit, /refresh_token_envelope\s*=\s*p_refresh_token_envelope/)

  assert.match(release, /token_version\s*=\s*p_expected_version/)
  assert.match(release, /refresh_lease_owner\s*=\s*p_lease_owner/)

  assert.match(reauth, /token_version\s*=\s*p_expected_version/)
  assert.match(reauth, /refresh_lease_owner\s*=\s*p_lease_owner/)
  assert.match(reauth, /status\s*=\s*'reauthorization_required'/)
  assert.match(reauth, /refresh_lease_owner\s*=\s*null/)
})
