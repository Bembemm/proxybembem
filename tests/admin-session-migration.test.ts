import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202608310001_admin_sessions.sql",
  import.meta.url,
)
const RPCS = [
  "activate_admin_session",
  "authorize_admin_session",
  "revoke_admin_session",
] as const

async function sql() {
  return (await readFile(MIGRATION, "utf8")).toLowerCase()
}

test("admin session migration creates a backend-only one-session table", async () => {
  const text = await sql()
  assert.match(text, /create\s+table\s+if\s+not\s+exists\s+public\.admin_sessions/)
  assert.match(text, /auth_session_id\s+uuid\s+not\s+null\s+unique/)
  assert.match(text, /user_id\s+uuid\s+not\s+null/)
  assert.match(text, /created_at\s+timestamptz\s+not\s+null/)
  assert.match(text, /last_activity_at\s+timestamptz\s+not\s+null/)
  assert.match(text, /revoked_at\s+timestamptz/)
  assert.match(text, /create\s+unique\s+index[\s\S]*?on\s+public\.admin_sessions\s*\(\s*user_id\s*\)[\s\S]*?where\s+revoked_at\s+is\s+null/)
  assert.match(text, /alter\s+table\s+public\.admin_sessions\s+enable\s+row\s+level\s+security/)
  assert.match(text, /revoke\s+all\s+on\s+table\s+public\.admin_sessions\s+from\s+public\s*,\s*anon\s*,\s*authenticated/)
  assert.match(text, /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete\s+on\s+table\s+public\.admin_sessions\s+to\s+service_role/)
})

test("admin session RPCs are fixed-search-path security definer and service-role only", async () => {
  const text = await sql()

  for (const name of RPCS) {
    const start = text.indexOf(`function public.${name}`)
    assert.ok(start >= 0, `missing ${name}`)
    const next = text.indexOf("function public.", start + 1)
    const block = text.slice(start, next >= 0 ? next : undefined)
    assert.match(block, /security\s+definer/, `${name} must be SECURITY DEFINER`)
    assert.match(block, /set\s+search_path\s*=\s*''/, `${name} must fix search_path`)
    assert.match(
      text,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\([\\s\\S]*?\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`),
      `${name} must be revoked from browser roles`,
    )
    assert.match(
      text,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\([\\s\\S]*?\\)\\s+to\\s+service_role`),
      `${name} must be service_role only`,
    )
  }
})

test("activation is serialized, single-session and refuses reuse of stale Supabase session ids", async () => {
  const text = await sql()
  const start = text.indexOf("function public.activate_admin_session")
  const end = text.indexOf("function public.authorize_admin_session", start)
  const block = text.slice(start, end)

  assert.match(block, /pg_advisory_xact_lock/)
  assert.match(block, /hashtextextended\s*\(\s*p_user_id::text\s*,\s*0\s*\)/)
  assert.match(block, /where\s+auth_session_id\s*=\s*p_auth_session_id[\s\S]*?user_id\s*=\s*p_user_id[\s\S]*?for\s+update/)
  assert.match(block, /interval\s+'30 minutes'/)
  assert.match(block, /if\s+found[\s\S]*?return\s+null/)
  assert.match(block, /update\s+public\.admin_sessions[\s\S]*?set\s+revoked_at\s*=\s*now\s*\(\s*\)[\s\S]*?where\s+user_id\s*=\s*p_user_id[\s\S]*?revoked_at\s+is\s+null/)
  assert.match(block, /insert\s+into\s+public\.admin_sessions\s*\(\s*auth_session_id\s*,\s*user_id\s*\)/)
})

test("authorization atomically expires at 30 minutes and touches only when requested", async () => {
  const text = await sql()
  const start = text.indexOf("function public.authorize_admin_session")
  const end = text.indexOf("function public.revoke_admin_session", start)
  const block = text.slice(start, end)

  assert.match(block, /select\s+id\s*,\s*last_activity_at\s*,\s*revoked_at[\s\S]*?into\s+v_id\s*,\s*v_last_activity\s*,\s*v_revoked_at/)
  assert.match(block, /for\s+update/)
  assert.match(block, /return\s+'missing'/)
  assert.match(block, /return\s+'revoked'/)
  assert.match(block, /v_last_activity\s*<=\s*now\s*\(\s*\)\s*-\s*interval\s+'30 minutes'/)
  assert.match(block, /set\s+revoked_at\s*=\s*now\s*\(\s*\)/)
  assert.match(block, /return\s+'expired'/)
  assert.match(block, /if\s+p_touch\s+then[\s\S]*?last_activity_at\s*=\s*now\s*\(\s*\)/)
  assert.match(block, /return\s+'active'/)
})

test("revoke only revokes the matching active session", async () => {
  const text = await sql()
  const start = text.indexOf("function public.revoke_admin_session")
  const block = text.slice(start)
  assert.match(block, /update\s+public\.admin_sessions/)
  assert.match(block, /auth_session_id\s*=\s*p_auth_session_id/)
  assert.match(block, /user_id\s*=\s*p_user_id/)
  assert.match(block, /revoked_at\s+is\s+null/)
  assert.match(block, /get\s+diagnostics[\s\S]*?row_count/)
})
