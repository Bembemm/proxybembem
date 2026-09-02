import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("production page is a protected server surface with exactly three fixed operational queues", async () => {
  const page = await source("../app/admin/producao/page.tsx")

  assert.ok(page.length > 0, "missing /admin/producao page")
  assert.doesNotMatch(page, /^["']use client["']/m)
  assert.match(page, /dynamic\s*=\s*["']force-dynamic["']/)
  assert.match(page, /requireAdminPageAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)
  assert.match(page, /AdminShell/)
  assert.match(page, /activeSection=["']production["']/)

  for (const label of ["Aguardando produção", "Em produção", "Pronto para envio"]) {
    assert.equal(page.match(new RegExp(label, "g"))?.length ?? 0, 1, `${label} must appear exactly once`)
  }

  for (const status of ["awaiting_production", "in_production", "ready_to_ship"]) {
    assert.equal(
      page.match(new RegExp(`fulfillmentStatus:\\s*["']${status}["']`, "g"))?.length ?? 0,
      1,
      `${status} must be loaded exactly once`,
    )
  }

  assert.equal(page.match(/listAdminOrders\s*\(/g)?.length ?? 0, 3)
  assert.equal(page.match(/sort:\s*["']oldest["']/g)?.length ?? 0, 3)

  const pageSizes = [...page.matchAll(/pageSize:\s*(\d+)/g)].map((match) => Number(match[1]))
  assert.equal(pageSizes.length, 3)
  assert.ok(pageSizes.every((value) => Number.isSafeInteger(value) && value > 0 && value <= 50))
})

test("production queues render only the approved operational card summary", async () => {
  const page = await source("../app/admin/producao/page.tsx")

  assert.ok(page.length > 0, "missing /admin/producao page")
  assert.match(page, /order\.order_number/)
  assert.match(page, /order\.customer_name/)
  assert.match(page, /order\.created_at/)
  assert.match(page, /order\.total_cents\s*\?\?\s*order\.subtotal_cents/)
  assert.match(page, /PaymentStatusBadge/)
  assert.match(page, /open_attention_count/)
  assert.match(page, /open_attention_severity/)
  assert.match(page, /\/admin\/pedidos\/\$\{order\.id\}/)
  assert.match(page, /America\/Sao_Paulo/)

  assert.doesNotMatch(
    page,
    /address_street|address_number|address_complement|address_neighborhood|address_city|address_state|cep\b|payment_id|preference_id|payment_status_detail/,
  )
  assert.doesNotMatch(page, /fulfillmentStatus:\s*["'](?:completed|canceled|shipped|awaiting_payment)["']/)
  assert.doesNotMatch(page, /createBrowserClient|createClientComponentClient/)
  assert.doesNotMatch(page, /\.sort\s*\(\s*\(/)
})

test("production page contains no financial mutation or destructive order controls", async () => {
  const page = await source("../app/admin/producao/page.tsx")

  assert.ok(page.length > 0, "missing /admin/producao page")
  assert.doesNotMatch(page, /Marcar como pago|Aprovar pagamento|Reembolsar|Refundar|Forçar status|Forcar status/i)
  assert.doesNotMatch(page, /DangerConfirmForm|\/cancel\b/)
  assert.doesNotMatch(page, /method=["']post["']/i)
})
