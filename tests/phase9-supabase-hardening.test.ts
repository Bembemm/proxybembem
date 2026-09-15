import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

function functionBlock(sql: string, name: string) {
  const marker = `create or replace function public.${name}`
  const start = sql.toLowerCase().indexOf(marker.toLowerCase())
  assert.notEqual(start, -1, `missing ${name}`)
  const end = sql.indexOf("$$;", start)
  assert.notEqual(end, -1, `missing end of ${name}`)
  return sql.slice(start, end + 3)
}

function assertDefinerWithFixedSearchPath(block: string) {
  assert.match(block, /security\s+definer/i)
  assert.match(block, /set\s+search_path\s*=\s*''/i)
}

function assertServiceRoleOnly(sql: string, signature: RegExp) {
  assert.match(sql, signature)
  assert.match(sql, /from\s+public\s*,\s*anon\s*,\s*authenticated/i)
  assert.match(sql, /grant\s+execute[\s\S]+to\s+service_role/i)
}

test("customer read RPCs remain authenticated security-definer functions scoped by auth.uid", async () => {
  const sql = await source("../supabase/migrations/202609020003_customer_accounts_orders.sql")

  for (const name of ["customer_list_orders", "customer_get_order"]) {
    const block = functionBlock(sql, name)
    assertDefinerWithFixedSearchPath(block)
    assert.match(block, /auth\.uid\(\)/i)
    assert.doesNotMatch(block, /p_customer_id\b/i)
  }

  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.customer_list_orders\(integer,integer\)[\s\S]*?from\s+public\s*,\s*anon\s*;[\s\S]*?grant\s+execute[\s\S]*?to\s+authenticated\s*;/i,
  )
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.customer_get_order\(uuid\)[\s\S]*?from\s+public\s*,\s*anon\s*;[\s\S]*?grant\s+execute[\s\S]*?to\s+authenticated\s*;/i,
  )
})

test("customer guest-claim RPC remains service-role only despite accepting an explicit customer id", async () => {
  const sql = await source("../supabase/migrations/202609020003_customer_accounts_orders.sql")
  const block = functionBlock(sql, "claim_guest_order_for_customer")

  assertDefinerWithFixedSearchPath(block)
  assert.match(block, /p_customer_id\s+uuid/i)
  assert.match(block, /from\s+auth\.users/i)
  assertServiceRoleOnly(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.claim_guest_order_for_customer\(text,uuid,text\)/i,
  )
})

test("representative privileged RPCs keep fixed search paths and service-role-only execution", async () => {
  const [sessions, payments, settings, dashboard] = await Promise.all([
    source("../supabase/migrations/202608310001_admin_sessions.sql"),
    source("../supabase/migrations/202609020001_admin_order_operations_foundation.sql"),
    source("../supabase/migrations/202609140003_store_settings.sql"),
    source("../supabase/migrations/202609150001_dashboard_metrics_attention_center.sql"),
  ])

  for (const name of ["activate_admin_session", "authorize_admin_session", "revoke_admin_session"]) {
    assertDefinerWithFixedSearchPath(functionBlock(sessions, name))
  }
  assertServiceRoleOnly(
    sessions,
    /revoke\s+all\s+on\s+function\s+public\.activate_admin_session\(uuid,uuid\)/i,
  )
  assertServiceRoleOnly(
    sessions,
    /revoke\s+all\s+on\s+function\s+public\.authorize_admin_session\(uuid,uuid,boolean\)/i,
  )
  assertServiceRoleOnly(
    sessions,
    /revoke\s+all\s+on\s+function\s+public\.revoke_admin_session\(uuid,uuid\)/i,
  )

  assertDefinerWithFixedSearchPath(functionBlock(payments, "apply_mercadopago_payment_event"))
  assertServiceRoleOnly(
    payments,
    /revoke\s+all\s+on\s+function\s+public\.apply_mercadopago_payment_event\(text,text,text,text,integer,text\)/i,
  )

  assertDefinerWithFixedSearchPath(functionBlock(settings, "admin_update_store_settings"))
  assertServiceRoleOnly(
    settings,
    /revoke\s+all\s+on\s+function\s+public\.admin_update_store_settings\([\s\S]*?\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i,
  )

  assertDefinerWithFixedSearchPath(functionBlock(dashboard, "admin_get_dashboard_snapshot"))
  assertServiceRoleOnly(
    dashboard,
    /revoke\s+all\s+on\s+function\s+public\.admin_get_dashboard_snapshot\(\)/i,
  )
})

test("Phase 9 RLS optimization changes policy evaluation only and drops no indexes", async () => {
  const sql = await source(
    "../supabase/migrations/202609150002_phase9_customer_profiles_rls_performance.sql",
  )

  assert.match(sql, /\(select\s+auth\.uid\(\)\)\s*=\s*id/i)
  assert.doesNotMatch(sql, /grant\s+/i)
  assert.doesNotMatch(sql, /drop\s+index/i)
})
