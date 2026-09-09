import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609080004_shipment_operations.sql",
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

const RPCS = [
  "admin_create_shipment_draft",
  "admin_claim_shipment_prepare",
  "admin_commit_shipment_cart",
  "admin_revert_shipment_prepare",
  "admin_claim_shipment_purchase",
  "admin_commit_shipment_purchase",
  "admin_revert_shipment_purchase",
  "admin_mark_shipment_attention",
  "admin_resolve_shipment_reconciliation",
  "admin_claim_shipment_generation",
  "admin_commit_shipment_generation",
  "admin_claim_shipment_cancel",
  "admin_commit_shipment_cancel",
  "admin_confirm_shipment_posting",
  "shipment_apply_tracking_update",
] as const

test("defines every shipment mutation RPC as fixed-search-path service-role-only security definer", async () => {
  const text = await sql()

  for (const rpc of RPCS) {
    const block = between(text, `function public.${rpc}`)
    assert.match(block, /language\s+plpgsql/)
    assert.match(block, /security\s+definer/)
    assert.match(block, /set\s+search_path\s*=\s*''/)
    assert.match(
      text,
      new RegExp(
        `revoke\\s+all\\s+on\\s+function\\s+public\\.${rpc}\\([^;]+\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,
      ),
    )
    assert.match(
      text,
      new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+public\\.${rpc}\\([^;]+\\)\\s+to\\s+service_role`,
      ),
    )
    assert.doesNotMatch(
      text,
      new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+public\\.${rpc}\\([^;]+\\)\\s+to\\s+(?:public|anon|authenticated)`,
      ),
    )
  }

  assert.doesNotMatch(text, /execute\s+(?:format\s*\(|[^;]*\|\|)/)
  assert.doesNotMatch(text, /grant\s+[^;]*(?:delete|truncate)[^;]*public\.shipments/)
})

test("draft creation locks the order, derives eligibility server-side and preserves the one-active-shipment rule", async () => {
  const text = await sql()
  const block = between(
    text,
    "function public.admin_create_shipment_draft",
    "function public.admin_claim_shipment_prepare",
  )

  assert.match(block, /from\s+public\.orders[\s\S]*for\s+update/)
  assert.match(block, /payment_status[\s\S]*'approved'/)
  assert.match(block, /fulfillment_status[\s\S]*'ready_to_ship'/)
  assert.match(block, /shipping_sender_profiles/)
  assert.match(block, /sender_profile_version/)
  assert.match(block, /environment/)
  assert.match(block, /insert\s+into\s+public\.shipments/)
  assert.match(block, /'draft'/)
  assert.match(block, /shipments_one_active_per_order_uidx|active_exists/)
  assert.match(block, /insert\s+into\s+public\.shipment_events/)
  assert.match(block, /insert\s+into\s+public\.admin_audit_log/)
  assert.doesNotMatch(block, /p_payment_status|p_fulfillment_status|p_customer_id/)
  assert.doesNotMatch(block, /set\s+payment_status\s*=/)
})

test("prepare and purchase use expected-version plus durable operation-id claims instead of expiring leases", async () => {
  const text = await sql()
  const prepareClaim = between(
    text,
    "function public.admin_claim_shipment_prepare",
    "function public.admin_commit_shipment_cart",
  )
  const cartCommit = between(
    text,
    "function public.admin_commit_shipment_cart",
    "function public.admin_revert_shipment_prepare",
  )
  const purchaseClaim = between(
    text,
    "function public.admin_claim_shipment_purchase",
    "function public.admin_commit_shipment_purchase",
  )
  const purchaseCommit = between(
    text,
    "function public.admin_commit_shipment_purchase",
    "function public.admin_revert_shipment_purchase",
  )
  const purchaseRevert = between(
    text,
    "function public.admin_revert_shipment_purchase",
    "function public.admin_mark_shipment_attention",
  )

  for (const block of [prepareClaim, cartCommit, purchaseClaim, purchaseCommit, purchaseRevert]) {
    assert.match(block, /for\s+update/)
    assert.match(block, /p_expected_version/)
    assert.match(block, /version/)
  }

  assert.match(prepareClaim, /p_operation_id/)
  assert.match(prepareClaim, /operation_kind[\s\S]*'prepare'/)
  assert.match(cartCommit, /operation_id[\s\S]*p_operation_id/)
  assert.match(cartCommit, /operation_kind[\s\S]*'prepare'/)
  assert.match(cartCommit, /'in_cart'/)
  assert.match(purchaseClaim, /state[\s\S]*'in_cart'/)
  assert.match(purchaseClaim, /'purchase_pending'/)
  assert.match(purchaseClaim, /operation_kind[\s\S]*'purchase'/)
  assert.match(purchaseCommit, /state[\s\S]*'purchase_pending'/)
  assert.match(purchaseCommit, /operation_id[\s\S]*p_operation_id/)
  assert.match(purchaseCommit, /'purchased'/)
  assert.match(purchaseRevert, /state[\s\S]*'purchase_pending'/)
  assert.match(purchaseRevert, /'in_cart'/)

  const purchaseArea = `${purchaseClaim}\n${purchaseCommit}\n${purchaseRevert}`
  assert.doesNotMatch(purchaseArea, /lease|expires_at|interval\s+'|pg_sleep/)
  assert.doesNotMatch(purchaseArea, /set\s+payment_status\s*=/)
})

test("attention preserves the stable state and purchase uncertainty clears only through explicit reconciliation", async () => {
  const text = await sql()
  const attention = between(
    text,
    "function public.admin_mark_shipment_attention",
    "function public.admin_resolve_shipment_reconciliation",
  )
  const reconciliation = between(
    text,
    "function public.admin_resolve_shipment_reconciliation",
    "function public.admin_claim_shipment_generation",
  )

  assert.match(attention, /for\s+update/)
  assert.match(attention, /stable_state_before_attention/)
  assert.match(attention, /attention_required/)
  assert.match(attention, /purchase_outcome_unknown/)
  assert.match(attention, /cart_outcome_unknown|cancel_outcome_unknown/)
  assert.match(attention, /insert\s+into\s+public\.shipment_events/)

  assert.match(reconciliation, /for\s+update/)
  assert.match(reconciliation, /state[\s\S]*'attention_required'/)
  assert.match(reconciliation, /attention_reason[\s\S]*'purchase_outcome_unknown'/)
  assert.match(reconciliation, /p_resolution[\s\S]*'purchased'[\s\S]*'not_purchased'/)
  assert.match(reconciliation, /provider_order_id|p_provider_order_id/)
  assert.match(reconciliation, /purchased_cost_cents|p_purchased_cost_cents/)
  assert.match(reconciliation, /insert\s+into\s+public\.shipment_events/)
  assert.match(reconciliation, /insert\s+into\s+public\.admin_audit_log/)
  assert.doesNotMatch(reconciliation, /p_target_state|p_next_state/)

  const outsideReconciliation = text.replace(reconciliation, "")
  assert.doesNotMatch(
    outsideReconciliation,
    /purchase_outcome_unknown[\s\S]{0,500}set[\s\S]{0,200}state\s*=\s*'in_cart'/,
  )
})

test("generation and cancellation stay separate from order fulfillment while posting and trusted tracking use restricted forward transitions", async () => {
  const text = await sql()
  const generation = between(
    text,
    "function public.admin_claim_shipment_generation",
    "function public.admin_claim_shipment_cancel",
  )
  const cancellation = between(
    text,
    "function public.admin_claim_shipment_cancel",
    "function public.admin_confirm_shipment_posting",
  )
  const posting = between(
    text,
    "function public.admin_confirm_shipment_posting",
    "function public.shipment_apply_tracking_update",
  )
  const tracking = between(text, "function public.shipment_apply_tracking_update")

  assert.match(generation, /'purchased'/)
  assert.match(generation, /'generation_pending'/)
  assert.match(generation, /'generated'/)
  assert.doesNotMatch(generation, /update\s+public\.orders/)

  assert.match(cancellation, /'cancel_pending'/)
  assert.match(cancellation, /'canceled'/)
  assert.doesNotMatch(cancellation, /update\s+public\.orders/)
  assert.doesNotMatch(cancellation, /set\s+fulfillment_status\s*=/)

  assert.match(posting, /from\s+public\.orders[\s\S]*for\s+update/)
  assert.match(posting, /fulfillment_status[\s\S]*'ready_to_ship'/)
  assert.match(posting, /update\s+public\.orders[\s\S]*set\s+fulfillment_status\s*=\s*'shipped'/)
  assert.match(posting, /insert\s+into\s+public\.order_events/)
  assert.match(posting, /insert\s+into\s+public\.shipment_events/)
  assert.match(posting, /insert\s+into\s+public\.admin_audit_log/)
  assert.doesNotMatch(posting, /set\s+payment_status\s*=/)

  assert.match(tracking, /p_tracking_state[\s\S]*'posted'[\s\S]*'in_transit'[\s\S]*'delivered'/)
  assert.match(tracking, /p_event_fingerprint/)
  assert.match(tracking, /shipment_events/)
  assert.match(tracking, /on\s+conflict/)
  assert.match(tracking, /fulfillment_status[\s\S]*'ready_to_ship'[\s\S]*'shipped'/)
  assert.match(tracking, /fulfillment_status[\s\S]*'shipped'[\s\S]*'completed'/)
  assert.doesNotMatch(tracking, /set\s+payment_status\s*=/)
  assert.doesNotMatch(tracking, /p_payment_status|p_customer_id/)
})
