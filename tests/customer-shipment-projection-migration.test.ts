import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function migration() {
  return readFile(
    new URL(
      "../supabase/migrations/202609080006_customer_shipment_projection.sql",
      import.meta.url,
    ),
    "utf8",
  )
}

test("customer shipment projection replaces only customer_get_order with the existing ownership boundary", async () => {
  const sql = await migration()

  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.customer_get_order\s*\(/i)
  assert.match(sql, /security\s+definer/i)
  assert.match(sql, /set\s+search_path\s*=\s*''/i)
  assert.match(sql, /v_customer_id\s+uuid\s*:=\s*auth\.uid\s*\(\s*\)/i)
  assert.match(sql, /o\.id\s*=\s*p_order_id/i)
  assert.match(sql, /o\.customer_id\s*=\s*v_customer_id/i)
  assert.match(sql, /if\s+not\s+found\s+then\s+return\s+null/i)
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.customer_get_order\(uuid\)\s+from\s+public\s*,\s*anon/i)
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.customer_get_order\(uuid\)\s+to\s+authenticated/i)
  assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+public\.customer_list_orders/i)
})

test("projection exposes exactly curated shipment fields and maps internal states to friendly statuses", async () => {
  const sql = await migration()

  for (const key of [
    "carrier_name",
    "service_name",
    "tracking_code",
    "status",
    "updated_at",
    "timeline",
  ]) {
    assert.match(sql, new RegExp(`'${key}'\\s*,`, "i"))
  }

  assert.match(sql, /when\s+v_shipment\.state\s+in\s*\([^)]*'draft'[^)]*'generated'[^)]*\)\s+then\s+'preparing'[\s\S]*/i)
  assert.match(sql, /when\s+v_shipment\.state\s*=\s*'posted'\s+then\s+'posted'/i)
  assert.match(sql, /when\s+v_shipment\.state\s*=\s*'in_transit'\s+then\s+'in_transit'/i)
  assert.match(sql, /when\s+v_shipment\.state\s*=\s*'delivered'\s+then\s+'delivered'/i)
  assert.match(sql, /when\s+v_shipment\.state\s*=\s*'canceled'\s+then\s+'canceled'/i)
  assert.match(sql, /when\s+v_shipment\.state\s*=\s*'attention_required'\s+then\s+'attention'/i)

  for (const forbidden of [
    "provider_cart_id",
    "provider_order_id",
    "provider_shipment_id",
    "provider_cost_cents",
    "purchased_cost_cents",
    "sender_profile_id",
    "sender_snapshot",
    "provider_status",
    "operation_id",
    "operation_kind",
    "attention_reason",
    "invoice_key",
    "cpf",
    "print_url",
    "dace",
    "oauth",
  ]) {
    assert.doesNotMatch(sql, new RegExp(`'${forbidden}'\\s*,`, "i"))
  }
})

test("shipment timeline is public-only, deduped by kind and chronologically ordered", async () => {
  const sql = await migration()

  assert.match(sql, /from\s+public\.shipment_events/i)
  assert.match(sql, /shipment_posted/i)
  assert.match(sql, /shipment_tracking_updated/i)
  assert.match(sql, /'posted'/i)
  assert.match(sql, /'in_transit'/i)
  assert.match(sql, /'delivered'/i)
  assert.match(sql, /group\s+by\s+t\.kind/i)
  assert.match(sql, /min\s*\(\s*t\.created_at\s*\)/i)
  assert.match(sql, /order\s+by\s+t\.created_at/i)
  assert.doesNotMatch(sql, /metadata\s*->>\s*'provider_status'[^;]*jsonb_build_object[\s\S]*/i)
})

test("projection selects only the current latest shipment for the already-owned order", async () => {
  const sql = await migration()

  assert.match(sql, /from\s+public\.shipments\s+s/i)
  assert.match(sql, /s\.order_id\s*=\s*p_order_id/i)
  assert.match(sql, /order\s+by\s+s\.created_at\s+desc\s*,\s*s\.id\s+desc/i)
  assert.match(sql, /limit\s+1/i)
})
