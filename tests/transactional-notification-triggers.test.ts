import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrationUrl = new URL(
  "../supabase/migrations/202609120002_transactional_notification_triggers.sql",
  import.meta.url,
)

async function sql() {
  return (await readFile(migrationUrl, "utf8")).replace(/\s+/g, " ")
}

test("order-event trigger maps only approved transactional order events", async () => {
  const text = await sql()
  assert.match(text, /create or replace function public\.enqueue_order_event_notification/i)
  assert.match(text, /new\.event_type = 'payment_status_changed'/i)
  assert.match(text, /new\.source = 'mercadopago'/i)
  assert.match(text, /new\.metadata ->> 'payment_status' = 'approved'/i)
  assert.match(text, /new\.metadata ->> 'payment_status' = 'refunded'/i)
  assert.match(text, /new\.metadata ->> 'payment_status' = 'charged_back'/i)
  assert.match(text, /new\.event_type = 'fulfillment_status_changed'/i)
  assert.match(text, /new\.source = 'admin'/i)
  assert.match(text, /new\.metadata ->> 'to' = 'in_production'/i)
  assert.match(text, /new\.metadata ->> 'to' = 'ready_to_ship'/i)
  assert.match(text, /new\.metadata ->> 'to' = 'canceled'/i)
  assert.match(text, /new\.metadata ->> 'to' = 'shipped'/i)
  assert.match(text, /shipping_provider is distinct from 'melhor_envio'/i)
  assert.doesNotMatch(text, /new\.metadata ->> 'to' = 'completed'.+delivered/is)
})

test("shipment trigger uses posted and trusted delivered evidence, not label lifecycle events", async () => {
  const text = await sql()
  assert.match(text, /create or replace function public\.enqueue_shipment_event_notification/i)
  assert.match(text, /new\.event_type = 'shipment_posted'/i)
  assert.match(text, /new\.event_type = 'shipment_tracking_updated'/i)
  assert.match(text, /new\.source = 'melhor_envio'/i)
  assert.match(text, /new\.metadata ->> 'to' = 'delivered'/i)
  assert.doesNotMatch(text, /shipment_added_to_cart[^;]+notification_outbox/is)
  assert.doesNotMatch(text, /shipment_purchased[^;]+notification_outbox/is)
  assert.doesNotMatch(text, /shipment_generated[^;]+notification_outbox/is)
})

test("trigger payload is an explicit customer-safe immutable projection", async () => {
  const text = await sql()
  for (const required of [
    "'version', 1",
    "'type', p_notification_type",
    "'orderId', v_order.id",
    "'orderNumber', v_order.order_number",
    "'customerName', v_order.customer_name",
    "'items'",
    "'subtotalCents', v_order.subtotal_cents",
    "'shippingCents', v_order.shipping_cents",
    "'totalCents'",
    "'address'",
    "'carrierName'",
    "'serviceName'",
    "'trackingCode'",
  ]) {
    assert.ok(text.includes(required), `missing safe payload field ${required}`)
  }
  assert.match(text, /item ->> 'title'/i)
  assert.match(text, /item ->> 'unitPriceCents'/i)
  assert.match(text, /item ->> 'quantity'/i)
  assert.doesNotMatch(text, /customer_cpf/i)
  assert.doesNotMatch(text, /payment_id/i)
  assert.doesNotMatch(text, /shipping_snapshot/i)
  assert.doesNotMatch(text, /recipient_snapshot/i)
  assert.doesNotMatch(text, /sender_snapshot/i)
})

test("automatic dedupe is deterministic from authoritative source event ids", async () => {
  const text = await sql()
  assert.match(text, /'order-event:' \|\| new\.id::text/i)
  assert.match(text, /'shipment-event:' \|\| new\.id::text/i)
  assert.match(text, /on conflict \(dedupe_key\) do nothing/i)
  assert.match(text, /provider_idempotency_key/i)
  assert.match(text, /new\.id::text/i)
})

test("both event tables receive AFTER INSERT triggers in the same transaction", async () => {
  const text = await sql()
  assert.match(text, /after insert on public\.order_events for each row execute function public\.enqueue_order_event_notification\(\)/i)
  assert.match(text, /after insert on public\.shipment_events for each row execute function public\.enqueue_shipment_event_notification\(\)/i)
  assert.match(text, /security definer set search_path = ''/i)
  assert.match(text, /revoke all on function public\.enqueue_order_event_notification\(\) from public, anon, authenticated/i)
  assert.match(text, /revoke all on function public\.enqueue_shipment_event_notification\(\) from public, anon, authenticated/i)
})
