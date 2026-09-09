import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609080003_shipments_foundation.sql",
  import.meta.url,
)

async function sql() {
  return (await readFile(MIGRATION, "utf8")).toLowerCase()
}

function assertBackendOnlyTable(text: string, table: string) {
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
  assert.match(
    text,
    new RegExp(`grant\\s+select\\s+on\\s+table\\s+public\\.${table}\\s+to\\s+service_role`),
  )
  assert.doesNotMatch(
    text,
    new RegExp(
      `grant\\s+(?:insert|update|delete|truncate|references|trigger|all)[^;]*public\\.${table}[^;]*service_role`,
    ),
  )
  assert.doesNotMatch(
    text,
    new RegExp(`grant[^;]*public\\.${table}[^;]*(?:anon|authenticated)`),
  )
}

test("creates one fixed PF sender profile per Melhor Envio environment with bounded address data", async () => {
  const text = await sql()

  assert.match(text, /create\s+table\s+if\s+not\s+exists\s+public\.shipping_sender_profiles/)
  assert.match(text, /id\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/)
  assert.match(text, /environment\s+text\s+not\s+null\s+unique/)
  assert.match(text, /environment\s+in\s*\(\s*'sandbox'\s*,\s*'production'\s*\)/)
  assert.match(text, /person_type\s+text\s+not\s+null[^,]*check\s*\(\s*person_type\s*=\s*'pf'\s*\)/)

  for (const field of [
    "full_name",
    "cpf",
    "email",
    "phone",
    "postal_code",
    "street",
    "number",
    "neighborhood",
    "city",
    "state",
  ]) {
    assert.match(text, new RegExp(`${field}\\s+text\\s+not\\s+null`), `${field} must be required`)
  }
  assert.match(text, /complement\s+text/)
  assert.match(text, /cpf[^;]*\^\\d\{11\}\$/)
  assert.match(text, /postal_code[^;]*\^\\d\{8\}\$/)
  assert.match(text, /state[^;]*\^\[a-z\]\{2\}\$/)
  assert.match(text, /version\s+bigint\s+not\s+null\s+default\s+1[^,]*check\s*\(\s*version\s*>\s*0\s*\)/)
  assert.match(text, /created_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/)
  assert.match(text, /updated_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/)

  assertBackendOnlyTable(text, "shipping_sender_profiles")
})

test("creates strict Melhor Envio shipment rows with immutable trusted snapshots and bounded provider identifiers", async () => {
  const text = await sql()
  assert.match(text, /create\s+table\s+if\s+not\s+exists\s+public\.shipments/)
  assert.match(text, /order_id\s+uuid\s+not\s+null\s+references\s+public\.orders\s*\(\s*id\s*\)\s+on\s+delete\s+restrict/)
  assert.match(text, /sender_profile_id\s+uuid\s+not\s+null\s+references\s+public\.shipping_sender_profiles\s*\(\s*id\s*\)\s+on\s+delete\s+restrict/)
  assert.match(text, /provider\s+text\s+not\s+null[^,]*check\s*\(\s*provider\s*=\s*'melhor_envio'\s*\)/)
  assert.match(text, /environment[^;]*'sandbox'[^;]*'production'/)
  assert.match(text, /document_mode\s+text\s+not\s+null[^,]*check\s*\(\s*document_mode\s*=\s*'declaration_content'\s*\)/)

  for (const state of [
    "draft",
    "prepared",
    "in_cart",
    "purchase_pending",
    "purchased",
    "generation_pending",
    "generated",
    "posted",
    "in_transit",
    "delivered",
    "cancel_pending",
    "canceled",
    "attention_required",
  ]) {
    assert.ok(text.includes(`'${state}'`), `shipment state ${state} must be constrained`)
  }

  for (const snapshot of [
    "recipient_snapshot",
    "sender_snapshot",
    "package_snapshot",
  ]) {
    assert.match(text, new RegExp(`${snapshot}\\s+jsonb\\s+not\\s+null`))
    assert.match(text, new RegExp(`jsonb_typeof\\s*\\(\\s*${snapshot}\\s*\\)\\s*=\\s*'object'`))
  }
  assert.match(text, /declaration_items_snapshot\s+jsonb\s+not\s+null/)
  assert.match(text, /jsonb_typeof\s*\(\s*declaration_items_snapshot\s*\)\s*=\s*'array'/)

  assert.match(text, /customer_shipping_cents\s+integer\s+not\s+null[^,]*check\s*\(\s*customer_shipping_cents\s*>=\s*0\s*\)/)
  assert.match(text, /provider_cost_cents\s+integer/)
  assert.match(text, /purchased_cost_cents\s+integer/)
  assert.match(text, /currency\s+text\s+not\s+null[^,]*check\s*\(\s*currency\s*=\s*'brl'\s*\)/)
  assert.match(text, /sender_profile_version\s+bigint\s+not\s+null[^,]*check\s*\(\s*sender_profile_version\s*>\s*0\s*\)/)

  for (const providerId of [
    "provider_cart_id",
    "provider_shipment_id",
    "provider_order_id",
    "tracking_code",
    "provider_status",
  ]) {
    assert.match(
      text,
      new RegExp(`${providerId}[^;]*char_length\\s*\\(\\s*${providerId}\\s*\\)\\s+between\\s+1\\s+and\\s+128`),
      `${providerId} must be bounded`,
    )
  }

  assert.match(text, /operation_kind\s+text/)
  assert.match(text, /operation_id\s+uuid/)
  assert.match(text, /operation_kind\s+is\s+null[^;]*operation_id\s+is\s+null/)
  assert.match(text, /attention_reason[^;]*char_length\s*\(\s*attention_reason\s*\)\s+between\s+1\s+and\s+64/)
  assert.match(text, /version\s+bigint\s+not\s+null\s+default\s+1[^,]*check\s*\(\s*version\s*>\s*0\s*\)/)

  assert.match(
    text,
    /create\s+unique\s+index\s+if\s+not\s+exists\s+shipments_one_active_per_order_uidx[\s\S]*?on\s+public\.shipments\s*\(\s*order_id\s*\)[\s\S]*?where\s+state\s*<>\s*'canceled'/,
  )
  assertBackendOnlyTable(text, "shipments")
})

test("creates append-only backend-only shipment events with per-shipment dedupe", async () => {
  const text = await sql()
  assert.match(text, /create\s+table\s+if\s+not\s+exists\s+public\.shipment_events/)
  assert.match(text, /shipment_id\s+uuid\s+not\s+null\s+references\s+public\.shipments\s*\(\s*id\s*\)\s+on\s+delete\s+restrict/)
  assert.match(text, /order_id\s+uuid\s+not\s+null\s+references\s+public\.orders\s*\(\s*id\s*\)\s+on\s+delete\s+restrict/)
  assert.match(text, /event_type\s+text\s+not\s+null/)
  assert.match(text, /metadata\s+jsonb\s+not\s+null\s+default\s+'\{\}'::jsonb/)
  assert.match(text, /jsonb_typeof\s*\(\s*metadata\s*\)\s*=\s*'object'/)
  assert.match(
    text,
    /create\s+unique\s+index\s+if\s+not\s+exists\s+shipment_events_dedupe_uidx[\s\S]*?on\s+public\.shipment_events\s*\(\s*shipment_id\s*,\s*dedupe_key\s*\)[\s\S]*?where\s+dedupe_key\s+is\s+not\s+null/,
  )

  assertBackendOnlyTable(text, "shipment_events")
})
