import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("payment application stays row-locked and event-deduplicated", async () => {
  const sql = await source(
    "../supabase/migrations/202609020001_admin_order_operations_foundation.sql",
  )

  assert.match(sql, /function\s+public\.apply_mercadopago_payment_event/i)
  assert.match(sql, /where\s+order_number\s*=\s*p_order_number[\s\S]*?for\s+update/i)
  assert.match(sql, /dedupe_key\s+text\s+unique/i)
  assert.match(sql, /'mercadopago:'\s*\|\|\s*p_payment_id/i)
  assert.match(sql, /on\s+conflict\s*\(dedupe_key\)\s+do\s+nothing/i)
})

test("checkout preference creation stays lease-serialized and completion is lease-owned", async () => {
  const sql = await source(
    "../supabase/migrations/202608300001_checkout_preference_lease.sql",
  )

  assert.match(sql, /checkout_preference_lease_id\s+uuid/i)
  assert.match(sql, /checkout_preference_lease_expires_at\s+timestamptz/i)
  assert.match(sql, /function\s+public\.claim_checkout_preference/i)
  assert.match(sql, /for\s+update/i)
  assert.match(sql, /interval\s+'30 seconds'/i)
  assert.match(sql, /'outcome'\s*,\s*'busy'/i)
  assert.match(
    sql,
    /function\s+public\.complete_checkout_preference[\s\S]*?checkout_preference_lease_id\s*=\s*p_lease_id/i,
  )
})

test("fulfillment transitions remain row-locked with deterministic event dedupe", async () => {
  const sql = await source(
    "../supabase/migrations/202609020002_admin_order_fulfillment_operations.sql",
  )

  assert.match(sql, /function\s+public\.admin_transition_order_fulfillment/i)
  assert.match(sql, /where\s+id\s*=\s*p_order_id[\s\S]*?for\s+update/i)
  assert.match(sql, /'admin-fulfillment:'\s*\|\|\s*v_order\.id::text/i)
  assert.match(sql, /on\s+conflict\s*\(dedupe_key\)\s+do\s+nothing/i)
})

test("product and Store Settings writes retain optimistic concurrency", async () => {
  const [products, settings] = await Promise.all([
    source("../lib/server/admin-products.ts"),
    source("../supabase/migrations/202609140003_store_settings.sql"),
  ])

  assert.match(products, /expectedUpdatedAt/)
  assert.match(products, /updated_at:\s*`eq\.\$\{expectedUpdatedAt\}`/)
  assert.match(products, /ProductConflictError/)

  assert.match(settings, /p_expected_updated_at\s+timestamptz/i)
  assert.match(settings, /for\s+update/i)
  assert.match(settings, /'outcome'\s*,\s*'conflict'/i)
  assert.match(settings, /v_previous\.updated_at\s+is\s+distinct\s+from\s+p_expected_updated_at/i)
})

test("shipment operations keep operation ids versions and explicit ambiguous-provider attention", async () => {
  const [operations, reconciliation] = await Promise.all([
    source("../supabase/migrations/202609080004_shipment_operations.sql"),
    source("../supabase/migrations/202609080005_shipment_cancel_reconciliation.sql"),
  ])

  assert.match(operations, /p_operation_id\s+uuid/i)
  assert.match(operations, /p_expected_version/i)
  assert.match(operations, /for\s+update/i)
  assert.match(operations, /version/i)
  assert.match(operations, /purchase_outcome_unknown/i)
  assert.match(reconciliation, /purchase_outcome_unknown/i)
  assert.match(reconciliation, /cancel_outcome_unknown/i)
})

test("notification outbox keeps queue claims dedupe and provider idempotency", async () => {
  const sql = await source(
    "../supabase/migrations/202609120001_transactional_notifications_foundation.sql",
  )

  assert.match(sql, /unique\s*\(dedupe_key\)/i)
  assert.match(sql, /unique\s*\(provider_idempotency_key\)/i)
  assert.match(sql, /function\s+public\.claim_due_notification_outbox/i)
  assert.match(sql, /for\s+update\s+skip\s+locked/i)
  assert.match(sql, /lease_expires_at/i)
  assert.match(sql, /next_attempt_at\s*<=\s*pg_catalog\.now\(\)/i)
})

test("password recovery remains lease-claimed and lease-owned on finish", async () => {
  const sql = await source(
    "../supabase/migrations/202609050001_password_recovery_grants.sql",
  )

  assert.match(sql, /lease_id\s+uuid/i)
  assert.match(sql, /lease_expires_at\s+timestamptz/i)
  assert.match(sql, /function\s+public\.claim_password_recovery_grant/i)
  assert.match(sql, /for\s+update/i)
  assert.match(sql, /'busy'::text/i)
  assert.match(
    sql,
    /function\s+public\.finish_password_recovery_grant[\s\S]*?lease_id\s*=\s*p_lease_id/i,
  )
})

test("attention flags keep one active code per order and explicit resolution", async () => {
  const sql = await source(
    "../supabase/migrations/202609020001_admin_order_operations_foundation.sql",
  )

  assert.match(sql, /create\s+unique\s+index[\s\S]*?order_attention_active_code_uidx/i)
  assert.match(sql, /on\s+public\.order_attention_flags\s*\(order_id,\s*code\)/i)
  assert.match(sql, /where\s+resolved_at\s+is\s+null/i)
  assert.match(sql, /set\s+resolved_at\s*=\s*coalesce\(resolved_at,\s*now\(\)\)/i)
})

test("dashboard snapshot uses one shared as-of instant", async () => {
  const sql = await source(
    "../supabase/migrations/202609150001_dashboard_metrics_attention_center.sql",
  )

  assert.match(sql, /v_as_of\s+timestamptz\s*:=\s*now\(\)/i)
  assert.match(sql, /ev\.created_at\s*<=\s*v_as_of/i)
  assert.match(sql, /'asOf'\s*,\s*v_as_of/i)
  assert.equal((sql.match(/v_as_of\s+timestamptz\s*:=/gi) ?? []).length, 1)
})
