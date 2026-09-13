import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609120001_transactional_notifications_foundation.sql",
  import.meta.url,
)

async function sql() {
  return (await readFile(MIGRATION, "utf8").catch(() => "")).toLowerCase()
}

function between(text: string, start: string, end?: string) {
  const from = text.indexOf(start)
  assert.ok(from >= 0, `missing ${start}`)
  if (!end) return text.slice(from)
  const to = text.indexOf(end, from + start.length)
  assert.ok(to > from, `missing ${end} after ${start}`)
  return text.slice(from, to)
}

test("defines a private bounded transactional notification outbox", async () => {
  const text = await sql()

  assert.match(text, /create\s+table(?:\s+if\s+not\s+exists)?\s+public\.notification_outbox/)
  assert.match(text, /create\s+table(?:\s+if\s+not\s+exists)?\s+public\.notification_webhook_events/)
  assert.match(text, /alter\s+table\s+public\.notification_outbox\s+enable\s+row\s+level\s+security/)
  assert.match(text, /alter\s+table\s+public\.notification_webhook_events\s+enable\s+row\s+level\s+security/)

  for (const kind of [
    "payment_approved",
    "production_started",
    "ready_to_ship",
    "shipped",
    "delivered",
    "canceled",
    "refunded",
    "charged_back",
  ]) {
    assert.match(text, new RegExp(`'${kind}'`))
  }

  for (const status of [
    "pending",
    "processing",
    "sent",
    "delivered",
    "retry_scheduled",
    "failed",
    "bounced",
  ]) {
    assert.match(text, new RegExp(`'${status}'`))
  }

  assert.match(text, /dedupe_key\s+text/)
  assert.match(text, /provider_idempotency_key\s+text\s+not\s+null/)
  assert.match(text, /provider_message_id\s+text/)
  assert.match(text, /template_payload\s+jsonb\s+not\s+null/)
  assert.match(text, /resend_of_id\s+uuid/)
  assert.match(text, /processing_lease_expires_at/)
  assert.match(text, /attempt_count\s+integer\s+not\s+null\s+default\s+0/)
  assert.match(text, /unique\s*\(\s*dedupe_key\s*\)/)
  assert.match(text, /unique\s*\(\s*svix_id\s*\)/)

  assert.match(text, /notification_outbox_due_idx/)
  assert.match(text, /notification_outbox_order_idx/)
  assert.match(text, /notification_outbox_provider_message_idx/)
  assert.match(text, /notification_outbox_resend_active_uidx/)

  assert.match(text, /revoke\s+all\s+on\s+table\s+public\.notification_outbox\s+from\s+public\s*,\s*anon\s*,\s*authenticated/)
  assert.match(text, /revoke\s+all\s+on\s+table\s+public\.notification_webhook_events\s+from\s+public\s*,\s*anon\s*,\s*authenticated/)
  assert.doesNotMatch(
    text,
    /grant\s+(?:select|insert|update|delete|all)[^;]+on\s+table\s+public\.notification_(?:outbox|webhook_events)[^;]+to\s+(?:anon|authenticated)/,
  )
})

test("claims due notifications atomically with a finite reclaimable lease and a 25-row bound", async () => {
  const text = await sql()
  const block = between(
    text,
    "function public.claim_due_notification_outbox",
    "function public.complete_notification_attempt",
  )

  assert.match(block, /security\s+definer/)
  assert.match(block, /set\s+search_path\s*=\s*''/)
  assert.match(block, /for\s+update\s+skip\s+locked/)
  assert.match(block, /p_limit\s+is\s+null\s+or\s+p_limit\s*<\s*1\s+or\s+p_limit\s*>\s*25/)
  assert.match(block, /next_attempt_at\s*<=\s*pg_catalog\.now\(\)/)
  assert.match(block, /status\s+in\s*\(\s*'pending'\s*,\s*'retry_scheduled'\s*\)/)
  assert.match(block, /status\s*=\s*'processing'[\s\S]*processing_lease_expires_at\s*<=\s*pg_catalog\.now\(\)/)
  assert.match(block, /processing_lease_expires_at\s*=\s*pg_catalog\.now\(\)\s*\+\s*pg_catalog\.make_interval\(secs\s*=>\s*p_lease_seconds\)/)
  assert.match(block, /status\s*=\s*'processing'/)
  assert.match(block, /processing_worker_id\s*=\s*p_worker_id/)
})

test("finalizes attempts with stable retry policy and a hard maximum of three automatic attempts", async () => {
  const text = await sql()
  const block = between(
    text,
    "function public.complete_notification_attempt",
    "function public.record_notification_webhook",
  )

  assert.match(block, /for\s+update/)
  assert.match(block, /attempt_count\s*=\s*v_next_attempt/)
  assert.match(block, /v_next_attempt\s*>=\s*3/)
  assert.match(block, /interval\s+'5 minutes'/)
  assert.match(block, /interval\s+'30 minutes'/)
  assert.match(block, /'retry_scheduled'/)
  assert.match(block, /'failed'/)
  assert.match(block, /'sent'/)
  assert.match(block, /provider_message_id/)
  assert.match(block, /last_error_code/)
  assert.doesNotMatch(block, /template_payload\s*=/)
  assert.doesNotMatch(block, /provider_idempotency_key\s*=/)
})

test("records provider webhook delivery by provider message id and consumes svix ids once", async () => {
  const text = await sql()
  const block = between(
    text,
    "function public.record_notification_webhook",
    "function public.admin_list_order_notifications",
  )

  assert.match(block, /insert\s+into\s+public\.notification_webhook_events/)
  assert.match(block, /on\s+conflict\s*\(\s*svix_id\s*\)\s+do\s+nothing/)
  assert.match(block, /provider_message_id\s*=\s*p_provider_message_id/)
  assert.doesNotMatch(block, /recipient_email\s*=\s*p_/)
  assert.match(block, /email\.sent/)
  assert.match(block, /email\.delivered/)
  assert.match(block, /email\.bounced/)
  assert.match(block, /email\.failed/)
  assert.match(block, /email\.suppressed/)
  assert.doesNotMatch(block, /email\.opened|email\.clicked/)
})

test("admin history is sanitized and manual resend is a distinct auditable immutable delivery", async () => {
  const text = await sql()
  const listBlock = between(
    text,
    "function public.admin_list_order_notifications",
    "function public.admin_resend_order_notification",
  )
  const resendBlock = between(text, "function public.admin_resend_order_notification")

  assert.match(listBlock, /notification_type/)
  assert.match(listBlock, /recipient_email/)
  assert.match(listBlock, /attempt_count/)
  assert.match(listBlock, /last_error_code/)
  assert.match(listBlock, /resend_of_id/)
  assert.doesNotMatch(listBlock, /template_payload|provider_idempotency_key/)

  assert.match(resendBlock, /for\s+update/)
  assert.match(resendBlock, /resend_of_id/)
  assert.match(resendBlock, /v_original\.recipient_email/)
  assert.match(resendBlock, /v_original\.template_payload/)
  assert.match(resendBlock, /v_original\.notification_type/)
  assert.match(resendBlock, /gen_random_uuid\(\)/)
  assert.match(resendBlock, /insert\s+into\s+public\.admin_audit_log/)
  assert.match(resendBlock, /notification_email_resent/)
  assert.match(resendBlock, /status\s+in\s*\(\s*'pending'\s*,\s*'processing'\s*,\s*'retry_scheduled'\s*\)/)

  assert.match(text, /revoke\s+all\s+on\s+function\s+public\.admin_resend_order_notification\([^;]+\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/)
  assert.match(text, /grant\s+execute\s+on\s+function\s+public\.admin_resend_order_notification\([^;]+\)\s+to\s+service_role/)
})
