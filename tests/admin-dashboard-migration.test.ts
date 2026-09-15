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

function cte(text: string, name: string, nextName: string) {
  const pattern = new RegExp(
    `${name}\\s+as\\s*\\(([\\s\\S]*?)\\),\\s*${nextName}\\s+as\\s*\\(`,
    "i",
  )
  const match = text.match(pattern)
  assert.ok(match, `Expected ${name} CTE before ${nextName}`)
  return match[1]
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

test("dashboard finance uses trusted Mercado Pago events with deterministic first-event dedupe", async () => {
  const text = await sql()
  const approvals = cte(text, "first_approvals", "first_reversals")
  const reversals = cte(text, "first_reversals", "orders_created")

  assert.match(approvals, /from\s+public\.order_events\s+ev/i)
  assert.match(approvals, /event_type\s*=\s*'payment_status_changed'/i)
  assert.match(approvals, /source\s*=\s*'mercadopago'/i)
  assert.match(approvals, /metadata\s*->>\s*'payment_status'\s*=\s*'approved'/i)
  assert.match(approvals, /distinct\s+on\s*\(\s*ev\.order_id\s*\)/i)
  assert.match(
    approvals,
    /order\s+by\s+ev\.order_id\s*,\s*ev\.created_at\s+asc\s*,\s*ev\.id\s+asc/i,
  )
  assert.match(approvals, /ev\.created_at\s*<=\s*v_as_of/i)

  assert.match(reversals, /from\s+public\.order_events\s+ev/i)
  assert.match(reversals, /event_type\s*=\s*'payment_status_changed'/i)
  assert.match(reversals, /source\s*=\s*'mercadopago'/i)
  assert.match(
    reversals,
    /metadata\s*->>\s*'payment_status'\s+in\s*\(\s*'refunded'\s*,\s*'charged_back'\s*\)/i,
  )
  assert.match(reversals, /distinct\s+on\s*\(\s*ev\.order_id\s*\)/i)
  assert.match(
    reversals,
    /order\s+by\s+ev\.order_id\s*,\s*ev\.created_at\s+asc\s*,\s*ev\.id\s+asc/i,
  )
  assert.match(reversals, /ev\.created_at\s*<=\s*v_as_of/i)

  assert.match(
    text,
    /coalesce\s*\(\s*o\.total_cents\s*,\s*o\.subtotal_cents\s*\)/i,
  )
})

test("dashboard uses one captured Sao Paulo as-of for calendar day week and month", async () => {
  const text = await sql()
  assert.match(text, /v_as_of\s+timestamptz\s*:=\s*now\s*\(\s*\)/i)
  assert.match(text, /v_local_now\s*:=\s*v_as_of\s+at\s+time\s+zone\s+'America\/Sao_Paulo'/i)
  assert.match(text, /v_today_start\s*:=\s*date_trunc\s*\(\s*'day'\s*,\s*v_local_now\s*\)\s+at\s+time\s+zone\s+'America\/Sao_Paulo'/i)
  assert.match(text, /v_week_start\s*:=\s*date_trunc\s*\(\s*'week'\s*,\s*v_local_now\s*\)\s+at\s+time\s+zone\s+'America\/Sao_Paulo'/i)
  assert.match(text, /v_month_start\s*:=\s*date_trunc\s*\(\s*'month'\s*,\s*v_local_now\s*\)\s+at\s+time\s+zone\s+'America\/Sao_Paulo'/i)

  for (const metricTime of ["o.created_at", "fa.approved_at", "fr.reversed_at"]) {
    assert.match(
      text,
      new RegExp(`${metricTime.replace(".", "\\.")}\\s*<=\\s*v_as_of`, "i"),
    )
  }
})

test("dashboard exposes current operation and current financial-risk status counts", async () => {
  const text = await sql()
  const risk = cte(text, "financial_risk", "operations")
  const operationCounts = cte(text, "operations", "open_attention")

  for (const status of [
    "awaiting_production",
    "in_production",
    "ready_to_ship",
    "shipped",
  ]) {
    assert.match(operationCounts, new RegExp(`fulfillment_status\\s*=\\s*'${status}'`, "i"))
  }

  assert.match(risk, /payment_status\s*=\s*'manual_review'/i)
  assert.match(risk, /payment_status\s*=\s*'refunded'/i)
  assert.match(risk, /payment_status\s*=\s*'charged_back'/i)
})

test("dashboard attention counts distinct orders at their highest unresolved severity", async () => {
  const text = await sql()
  const openAttention = cte(text, "open_attention", "attention_ranked")
  const ranked = cte(text, "attention_ranked", "attention_per_order")
  const perOrder = cte(text, "attention_per_order", "attention_summary")
  const summary = cte(text, "attention_summary", "attention_top_rows")
  const topRows = cte(text, "attention_top_rows", "attention_top")

  assert.match(openAttention, /from\s+public\.order_attention_flags\s+af/i)
  assert.match(openAttention, /resolved_at\s+is\s+null/i)
  assert.match(openAttention, /opened_at\s*<=\s*v_as_of/i)

  assert.match(
    ranked,
    /max\s*\(\s*oa\.severity_rank\s*\)\s+over\s*\(\s*partition\s+by\s+oa\.order_id\s*\)/i,
  )
  assert.match(
    ranked,
    /row_number\s*\(\s*\)\s+over\s*\([\s\S]*partition\s+by\s+oa\.order_id[\s\S]*order\s+by\s+oa\.severity_rank\s+desc\s*,\s*oa\.opened_at\s+asc\s*,\s*oa\.id\s+asc/i,
  )

  assert.match(perOrder, /where\s+ar\.primary_rank\s*=\s*1/i)
  assert.match(summary, /count\s*\(\s*\*\s*\)\s+as\s+total_orders/i)
  assert.match(summary, /highest_severity_rank\s*=\s*3/i)
  assert.match(summary, /highest_severity_rank\s*=\s*2/i)
  assert.match(summary, /highest_severity_rank\s*=\s*1/i)

  assert.match(
    topRows,
    /order\s+by\s+apo\.highest_severity_rank\s+desc\s*,\s*apo\.opened_at\s+asc\s*,\s*apo\.order_id\s+asc/i,
  )
  assert.match(topRows, /limit\s+5/i)
})

test("dashboard product sales use approval time and immutable order item snapshots", async () => {
  const text = await sql()
  const approvedMonthOrders = cte(text, "approved_month_orders", "month_items_raw")
  const monthItemsRaw = cte(text, "month_items_raw", "month_items")
  const productTopRows = cte(text, "product_top_rows", "product_top")

  assert.match(approvedMonthOrders, /from\s+first_approvals\s+fa/i)
  assert.match(approvedMonthOrders, /join\s+public\.orders\s+o\s+on\s+o\.id\s*=\s*fa\.order_id/i)
  assert.match(approvedMonthOrders, /fa\.approved_at\s*>=\s*v_month_start/i)
  assert.match(approvedMonthOrders, /fa\.approved_at\s*<=\s*v_as_of/i)
  assert.doesNotMatch(approvedMonthOrders, /o\.created_at/i)

  assert.match(monthItemsRaw, /jsonb_array_elements\s*\(\s*o\.items\s*\)/i)
  assert.match(monthItemsRaw, /productId/)
  assert.match(monthItemsRaw, /quantity/)
  assert.match(monthItemsRaw, /title/)

  assert.match(
    productTopRows,
    /order\s+by\s+pt\.quantity\s+desc\s*,\s*pt\.product_id\s+asc/i,
  )
  assert.match(productTopRows, /limit\s+10/i)
})
