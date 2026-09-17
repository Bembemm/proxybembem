import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

function requireSource(value: string, label: string) {
  assert.ok(value.length > 0, `missing ${label}`)
}

test("customer order surfaces never render raw payment or fulfillment status codes", async () => {
  const overview = await source("../app/minha-conta/page.tsx")
  const list = await source("../app/minha-conta/pedidos/page.tsx")
  const detail = await source("../app/minha-conta/pedidos/[id]/page.tsx")

  requireSource(overview, "customer account overview")
  requireSource(list, "customer orders list")
  requireSource(detail, "customer order detail")

  assert.doesNotMatch(overview, /\{order\.fulfillmentStatus\}/)
  assert.doesNotMatch(list, /\{order\.paymentStatus\}/)
  assert.doesNotMatch(list, /\{order\.fulfillmentStatus\}/)
  assert.doesNotMatch(detail, /\{order\.paymentStatus\}/)
  assert.doesNotMatch(detail, /\{order\.fulfillmentStatus\}/)

  assert.match(overview, /fulfillmentStatusLabel/)
  assert.match(list, /paymentStatusLabel/)
  assert.match(list, /fulfillmentStatusLabel/)
  assert.match(detail, /paymentStatusLabel/)
  assert.match(detail, /fulfillmentStatusLabel/)
})

test("admin order status UI uses shared Portuguese labels instead of technical filter values", async () => {
  const labels = await source("../lib/order-status-labels.ts")
  const badges = await source("../components/admin/status-badge.tsx")
  const orders = await source("../app/admin/pedidos/page.tsx")

  requireSource(labels, "shared order status labels")
  requireSource(badges, "admin status badges")
  requireSource(orders, "admin orders page")

  assert.match(labels, /approved:\s*"Aprovado"/)
  assert.match(labels, /awaiting_production:\s*"Aguardando produção"/)
  assert.match(labels, /export function paymentStatusLabel/)
  assert.match(labels, /export function fulfillmentStatusLabel/)

  assert.match(badges, /paymentStatusLabel/)
  assert.match(badges, /fulfillmentStatusLabel/)
  assert.doesNotMatch(orders, /placeholder="Ex\.: approved"/)
  assert.match(orders, /<select[\s\S]*?name="payment"/)
  assert.match(orders, /<option value="approved">Aprovado<\/option>/)
  assert.match(orders, /<option value="pending">Pendente<\/option>/)
})
