import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609150001_dashboard_metrics_attention_center.sql",
  import.meta.url,
)

async function sql() {
  return readFile(MIGRATION, "utf8")
}

test("dashboard snapshot RPC is read-only service-role-only and timezone explicit", async () => {
  const text = await sql()
  assert.match(
    text,
    /create\s+or\s+replace\s+function\s+public\.admin_get_dashboard_snapshot\s*\(\s*\)/i,
  )
  assert.match(text, /returns\s+jsonb/i)
  assert.match(text, /security\s+definer/i)
  assert.match(text, /set\s+search_path\s*=\s*''/i)
  assert.match(text, /America\/Sao_Paulo/)
  assert.match(
    text,
    /revoke\s+all\s+on\s+function\s+public\.admin_get_dashboard_snapshot\s*\(\s*\)[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,
  )
  assert.match(
    text,
    /grant\s+execute\s+on\s+function\s+public\.admin_get_dashboard_snapshot\s*\(\s*\)[\s\S]*to\s+service_role/i,
  )
})

test("dashboard finance uses trusted Mercado Pago events with first-event dedupe", async () => {
  const text = await sql()
  assert.match(text, /order_events/i)
  assert.match(text, /event_type\s*=\s*'payment_status_changed'/i)
  assert.match(text, /source\s*=\s*'mercadopago'/i)
  assert.match(text, /metadata\s*->>\s*'payment_status'\s*=\s*'approved'/i)
  assert.match(text, /metadata\s*->>\s*'payment_status'\s+in\s*\(\s*'refunded'\s*,\s*'charged_back'\s*\)/i)
  assert.match(text, /distinct\s+on\s*\(\s*ev\.order_id\s*\)/i)
  assert.match(
    text,
    /coalesce\s*\(\s*o\.total_cents\s*,\s*o\.subtotal_cents\s*\)/i,
  )
})

test("dashboard uses one Sao Paulo as-of for calendar day week and month", async () => {
  const text = await sql()
  assert.match(text, /v_as_of\s+timestamptz\s*:=\s*now\s*\(\s*\)/i)
  assert.match(text, /v_local_now\s*:=\s*v_as_of\s+at\s+time\s+zone\s+'America\/Sao_Paulo'/i)
  assert.match(text, /date_trunc\s*\(\s*'day'\s*,\s*v_local_now\s*\)/i)
  assert.match(text, /date_trunc\s*\(\s*'week'\s*,\s*v_local_now\s*\)/i)
  assert.match(text, /date_trunc\s*\(\s*'month'\s*,\s*v_local_now\s*\)/i)
})

test("dashboard exposes current operation and distinct-order attention metrics", async () => {
  const text = await sql()
  for (const status of [
    "awaiting_production",
    "in_production",
    "ready_to_ship",
    "shipped",
  ]) {
    assert.match(text, new RegExp(status))
  }
  assert.match(text, /payment_status\s*=\s*'manual_review'/i)
  assert.match(text, /payment_status\s*=\s*'refunded'/i)
  assert.match(text, /payment_status\s*=\s*'charged_back'/i)
  assert.match(text, /order_attention_flags/i)
  assert.match(text, /resolved_at\s+is\s+null/i)
  assert.match(text, /critical[\s\S]*warning[\s\S]*info/i)
  assert.match(text, /limit\s+5/i)
})

test("dashboard product sales expand immutable item snapshots and limit ranking", async () => {
  const text = await sql()
  assert.match(text, /jsonb_array_elements\s*\(\s*o\.items\s*\)/i)
  assert.match(text, /productId/)
  assert.match(text, /quantity/)
  assert.match(text, /approved_at\s*>=\s*v_month_start/i)
  assert.match(text, /limit\s+10/i)
})
