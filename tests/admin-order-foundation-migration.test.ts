import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609020001_admin_order_operations_foundation.sql",
  import.meta.url,
)

async function sql() {
  return (await readFile(MIGRATION, "utf8")).toLowerCase()
}

test("adds compatibility-safe fulfillment and backfills without fabricated history", async () => {
  const text = await sql()
  assert.match(text, /add\s+column\s+if\s+not\s+exists\s+fulfillment_status\s+text/)
  assert.match(text, /payment_status\s*=\s*'approved'[\s\S]*?'awaiting_production'/)
  assert.match(text, /else\s+'awaiting_payment'/)
  assert.match(text, /alter\s+column\s+fulfillment_status\s+set\s+default\s+'awaiting_payment'/)
  assert.match(text, /orders_fulfillment_status_allowed/)
  assert.doesNotMatch(
    text,
    /insert\s+into\s+public\.order_events[\s\S]*?created_at[\s\S]*?select[\s\S]*?orders/,
  )
})

test("creates backend-only event attention and audit tables", async () => {
  const text = await sql()
  for (const table of ["order_events", "order_attention_flags", "admin_audit_log"]) {
    assert.match(
      text,
      new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}`),
    )
    assert.match(
      text,
      new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`),
    )
    assert.match(
      text,
      new RegExp(
        `revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,
      ),
    )
  }

  assert.match(
    text,
    /grant\s+select\s*,\s*insert\s+on\s+table\s+public\.order_events\s+to\s+service_role/,
  )
  assert.match(
    text,
    /grant\s+select\s*,\s*insert\s+on\s+table\s+public\.admin_audit_log\s+to\s+service_role/,
  )
  assert.match(
    text,
    /grant\s+select\s*,\s*insert\s*,\s*update\s+on\s+table\s+public\.order_attention_flags\s+to\s+service_role/,
  )
})

test("upgraded payment RPC owns approved fulfillment transition and idempotent event side effects", async () => {
  const text = await sql()
  const start = text.indexOf("function public.apply_mercadopago_payment_event")
  assert.ok(start >= 0)
  const block = text.slice(start)
  assert.match(block, /for\s+update/)
  assert.match(block, /fulfillment_status\s*=\s*'awaiting_production'/)
  assert.match(block, /fulfillment_status\s*=\s*'awaiting_payment'/)
  assert.match(block, /insert\s+into\s+public\.order_events/)
  assert.match(block, /on\s+conflict\s*\(\s*dedupe_key\s*\)\s+do\s+nothing/)
  assert.match(block, /payment_manual_review/)
  assert.match(block, /payment_refunded/)
  assert.match(block, /payment_charged_back/)
  assert.match(block, /'fulfillment_transitioned'/)
})
