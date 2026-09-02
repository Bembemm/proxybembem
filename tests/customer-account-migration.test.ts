import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609020003_customer_accounts_orders.sql",
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

test("adds compatibility-safe customer email, ownership, and minimal RLS profile data", async () => {
  const text = await sql()

  assert.match(text, /add\s+column\s+if\s+not\s+exists\s+customer_email\s+text/)
  assert.match(text, /add\s+column\s+if\s+not\s+exists\s+customer_id\s+uuid/)
  assert.match(text, /customer_id[\s\S]*references\s+auth\.users\s*\(\s*id\s*\)/)
  assert.match(text, /orders_customer_id_created_idx/)
  assert.match(text, /create\s+table\s+if\s+not\s+exists\s+public\.customer_profiles/)
  assert.match(text, /alter\s+table\s+public\.customer_profiles\s+enable\s+row\s+level\s+security/)
  assert.match(text, /auth\.uid\s*\(\s*\)\s*=\s*id|id\s*=\s*auth\.uid\s*\(\s*\)/)
  assert.doesNotMatch(text, /alter\s+column\s+customer_email\s+set\s+not\s+null/)
  assert.doesNotMatch(text, /update\s+public\.orders[\s\S]{0,200}customer_email\s*=/)
  assert.doesNotMatch(text, /update\s+public\.orders[\s\S]{0,200}customer_id\s*=/)
  assert.doesNotMatch(text, /grant\s+select\s+on\s+(?:table\s+)?public\.orders\s+to\s+authenticated/)
})

test("defines customer-owned list and detail RPCs that derive ownership from auth.uid and return curated data", async () => {
  const text = await sql()
  const list = between(
    text,
    "function public.customer_list_orders",
    "function public.customer_get_order",
  )
  const detail = between(
    text,
    "function public.customer_get_order",
    "function public.claim_guest_order_for_customer",
  )

  assert.match(list, /returns\s+jsonb/)
  assert.match(list, /auth\.uid\s*\(\s*\)/)
  assert.match(list, /customer_id/)
  assert.match(list, /jsonb_build_object\s*\([\s\S]*?'orders'[\s\S]*?'total'/)
  assert.match(list, /p_limit\s+integer/)
  assert.match(list, /p_offset\s+integer/)
  assert.doesNotMatch(list, /public_token|checkout_attempt_id|checkout_fingerprint|checkout_url|shipping_snapshot|admin_audit/)

  assert.match(detail, /returns\s+jsonb/)
  assert.match(detail, /auth\.uid\s*\(\s*\)/)
  assert.match(detail, /customer_id/)
  assert.match(detail, /order_events/)
  assert.match(detail, /payment_approved|production_started|ready_to_ship|shipped|completed|canceled/)
  assert.doesNotMatch(detail, /public_token|checkout_attempt_id|checkout_fingerprint|checkout_url|shipping_snapshot|admin_audit/)

  assert.match(
    text,
    /grant\s+execute\s+on\s+function\s+public\.customer_list_orders\([^;]+\)\s+to\s+authenticated/,
  )
  assert.match(
    text,
    /grant\s+execute\s+on\s+function\s+public\.customer_get_order\([^;]+\)\s+to\s+authenticated/,
  )
  assert.doesNotMatch(
    text,
    /grant\s+execute\s+on\s+function\s+public\.customer_(?:list_orders|get_order)\([^;]+\)\s+to\s+(?:public|anon)/,
  )
})

test("defines one service-role-only atomic verified-email plus token guest claim", async () => {
  const text = await sql()
  const claim = between(text, "function public.claim_guest_order_for_customer")

  assert.match(claim, /p_public_token\s+text/)
  assert.match(claim, /p_customer_id\s+uuid/)
  assert.match(claim, /p_verified_email\s+text/)
  assert.match(claim, /for\s+update/)
  assert.match(claim, /customer_email/)
  assert.match(claim, /customer_id/)
  assert.match(claim, /already_claimed/)
  assert.match(claim, /not_claimable/)
  assert.match(claim, /customer_order_claimed/)
  assert.match(claim, /source[\s\S]*'customer'/)
  assert.match(claim, /customer-claim:/)
  assert.doesNotMatch(claim, /set\s+payment_status\s*=/)
  assert.doesNotMatch(claim, /admin_audit_log/)
  assert.doesNotMatch(claim, /jsonb_build_object\s*\([^)]*(?:public_token|customer_email|p_verified_email)/)

  assert.match(
    text,
    /revoke\s+all\s+on\s+function\s+public\.claim_guest_order_for_customer\([^;]+\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/,
  )
  assert.match(
    text,
    /grant\s+execute\s+on\s+function\s+public\.claim_guest_order_for_customer\([^;]+\)\s+to\s+service_role/,
  )
})

test("keeps Phase 3 additive and does not fabricate historical customer identity", async () => {
  const text = await sql()

  assert.doesNotMatch(text, /drop\s+table\s+(?:if\s+exists\s+)?public\.orders/)
  assert.doesNotMatch(text, /delete\s+from\s+public\.orders/)
  assert.doesNotMatch(text, /update\s+public\.orders[\s\S]{0,200}(?:customer_email|customer_id)\s*=/)
  assert.doesNotMatch(text, /grant\s+[^;]*(?:insert|update|delete)[^;]*public\.orders[^;]*authenticated/)
  assert.match(text, /set\s+search_path\s*=\s*''/)
})
