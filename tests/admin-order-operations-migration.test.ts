import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609020002_admin_order_fulfillment_operations.sql",
  import.meta.url,
)

async function sql() {
  return (await readFile(MIGRATION, "utf8")).toLowerCase()
}

function between(text: string, start: string, end?: string) {
  const from = text.indexOf(start)
  assert.ok(from >= 0, `missing ${start}`)
  if (!end) return text.slice(from)
  const to = text.indexOf(end, from + start.length)
  assert.ok(to > from, `missing ${end} after ${start}`)
  return text.slice(from, to)
}

test("defines a bounded static admin order list RPC with safe totals and Sao Paulo date boundaries", async () => {
  const text = await sql()
  const block = between(
    text,
    "function public.admin_list_orders",
    "function public.admin_transition_order_fulfillment",
  )

  assert.match(block, /returns\s+jsonb/)
  assert.match(block, /p_from_date\s+date/)
  assert.match(block, /p_to_date\s+date/)
  assert.match(block, /p_sort\s+text/)
  assert.match(block, /p_limit\s+integer/)
  assert.match(block, /p_offset\s+integer/)
  assert.match(block, /america\/sao_paulo/)
  assert.match(block, /order_attention_flags/)
  assert.match(block, /critical[\s\S]*warning[\s\S]*info/)
  assert.match(block, /jsonb_build_object\s*\([\s\S]*?'orders'[\s\S]*?'total'/)
  assert.match(block, /newest/)
  assert.match(block, /oldest/)
  assert.doesNotMatch(block, /execute\s+(?:format\s*\(|[^;]*\|\|)/)
  assert.doesNotMatch(block, /public_token|checkout_fingerprint|checkout_url|shipping_snapshot/)

  assert.match(
    text,
    /revoke\s+all\s+on\s+function\s+public\.admin_list_orders\([^;]+\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/,
  )
  assert.match(
    text,
    /grant\s+execute\s+on\s+function\s+public\.admin_list_orders\([^;]+\)\s+to\s+service_role/,
  )
})

test("defines one locked atomic fulfillment transition with event audit and paid-cancel attention", async () => {
  const text = await sql()
  const block = between(
    text,
    "function public.admin_transition_order_fulfillment",
    "function public.resolve_canceled_paid_order_attention",
  )

  assert.match(block, /returns\s+jsonb/)
  assert.match(block, /for\s+update/)
  assert.match(block, /awaiting_payment[\s\S]*canceled/)
  assert.match(block, /awaiting_production[\s\S]*in_production/)
  assert.match(block, /in_production[\s\S]*ready_to_ship/)
  assert.match(block, /ready_to_ship[\s\S]*shipped/)
  assert.match(block, /shipped[\s\S]*completed/)
  assert.match(block, /payment_status\s*=\s*'approved'/)
  assert.match(block, /update\s+public\.orders[\s\S]*set\s+fulfillment_status/)
  assert.doesNotMatch(block, /set\s+payment_status\s*=/)
  assert.doesNotMatch(block, /set\s+[\s\S]{0,120}updated_at\s*=/)
  assert.match(block, /insert\s+into\s+public\.order_events/)
  assert.match(block, /fulfillment_status_changed/)
  assert.match(block, /admin-fulfillment:/)
  assert.match(block, /insert\s+into\s+public\.admin_audit_log/)
  assert.match(block, /production_started/)
  assert.match(block, /marked_ready_to_ship/)
  assert.match(block, /marked_shipped/)
  assert.match(block, /marked_completed/)
  assert.match(block, /order_canceled/)
  assert.match(block, /canceled_paid_order/)
  assert.match(block, /'critical'/)
  assert.match(block, /invalid_transition/)
  assert.match(block, /payment_precondition_failed/)
  assert.match(block, /unchanged/)
  assert.match(block, /not_found/)

  assert.match(
    text,
    /revoke\s+all\s+on\s+function\s+public\.admin_transition_order_fulfillment\([^;]+\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/,
  )
  assert.match(
    text,
    /grant\s+execute\s+on\s+function\s+public\.admin_transition_order_fulfillment\([^;]+\)\s+to\s+service_role/,
  )
})

test("resolves only canceled-paid attention after a real payment reversal", async () => {
  const text = await sql()
  const block = between(text, "function public.resolve_canceled_paid_order_attention")

  assert.match(block, /new\.payment_status[\s\S]*refunded/)
  assert.match(block, /new\.payment_status[\s\S]*charged_back/)
  assert.match(block, /update\s+public\.order_attention_flags/)
  assert.match(block, /code\s*=\s*'canceled_paid_order'/)
  assert.match(block, /resolved_at/)
  assert.doesNotMatch(block, /update\s+public\.orders/)
  assert.match(
    text,
    /create\s+trigger\s+resolve_canceled_paid_order_attention_after_reversal[\s\S]*?after\s+update\s+of\s+payment_status\s+on\s+public\.orders/,
  )
})

test("keeps Phase 2 additive and backend-only without weakening append-only history", async () => {
  const text = await sql()

  assert.doesNotMatch(text, /drop\s+table\s+(?:if\s+exists\s+)?public\.orders/)
  assert.doesNotMatch(text, /delete\s+from\s+public\.orders/)
  assert.doesNotMatch(text, /grant\s+[^;]*(?:update|delete)[^;]*admin_audit_log/)
  assert.doesNotMatch(text, /grant\s+[^;]*(?:update|delete)[^;]*order_events/)
  assert.doesNotMatch(
    text,
    /grant\s+execute\s+on\s+function\s+public\.admin_(?:list_orders|transition_order_fulfillment)\([^;]+\)\s+to\s+(?:public|anon|authenticated)/,
  )
  assert.match(text, /set\s+search_path\s*=\s*''/)
})
