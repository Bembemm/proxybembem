import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/202609140001_transactional_notification_final_hardening.sql",
  import.meta.url,
)

async function sql() {
  return (await readFile(MIGRATION, "utf8").catch(() => "")).toLowerCase().replace(/\s+/g, " ")
}

test("admin cancellation only enqueues after an authoritative approved payment event", async () => {
  const text = await sql()
  assert.match(text, /create or replace function public\.enqueue_order_event_notification/)
  assert.match(text, /new\.metadata ->> 'to' = 'canceled'/)
  assert.match(
    text,
    /exists\s*\(\s*select 1 from public\.order_events[^)]*order_id\s*=\s*new\.order_id[^)]*event_type\s*=\s*'payment_status_changed'[^)]*source\s*=\s*'mercadopago'[^)]*metadata\s*->>\s*'payment_status'\s*=\s*'approved'/,
  )
})

test("late provider events always link to the matching notification without downgrading terminal state", async () => {
  const text = await sql()
  assert.match(text, /create or replace function public\.record_notification_webhook/)
  assert.match(
    text,
    /select\s+id\s*,\s*status\s+into\s+v_notification_id\s*,\s*v_status\s+from\s+public\.notification_outbox\s+where\s+provider_message_id\s*=\s*p_provider_message_id/,
  )
  assert.match(
    text,
    /update\s+public\.notification_webhook_events\s+set\s+notification_id\s*=\s*v_notification_id\s+where\s+id\s*=\s*v_event_id/,
  )
  assert.match(text, /p_event_type\s*=\s*'email\.sent'[\s\S]*v_status\s+in\s*\(\s*'processing'\s*,\s*'sent'\s*\)/)
  assert.match(text, /p_event_type\s*=\s*'email\.delivered'[\s\S]*v_status\s+in\s*\(\s*'sent'\s*,\s*'delivered'\s*\)/)
  assert.match(text, /p_event_type\s*=\s*'email\.bounced'[\s\S]*v_status\s+not\s+in\s*\(\s*'delivered'\s*,\s*'bounced'\s*\)/)
  assert.match(text, /v_status\s+not\s+in\s*\(\s*'delivered'\s*,\s*'bounced'\s*,\s*'failed'\s*\)/)
})

test("hardening RPCs remain service-role-only with empty search_path", async () => {
  const text = await sql()
  assert.match(text, /security definer set search_path = ''/)
  assert.match(
    text,
    /revoke all on function public\.record_notification_webhook\(text, text, text\) from public, anon, authenticated/,
  )
  assert.match(
    text,
    /grant execute on function public\.record_notification_webhook\(text, text, text\) to service_role/,
  )
  assert.match(
    text,
    /revoke all on function public\.enqueue_order_event_notification\(\) from public, anon, authenticated/,
  )
  assert.match(
    text,
    /grant execute on function public\.enqueue_order_event_notification\(\) to service_role/,
  )
})
