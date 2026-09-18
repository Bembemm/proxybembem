import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("customer order detail offers only a WhatsApp cancellation request", async () => {
  const detail = await source("../app/minha-conta/pedidos/[id]/page.tsx")

  assert.match(detail, /const\s+canRequestCancellation\s*=/)
  assert.match(detail, /["']shipped["']/)
  assert.match(detail, /["']completed["']/)
  assert.match(detail, /["']canceled["']/)
  assert.match(detail, /const\s+cancellationUrl\s*=\s*canRequestCancellation/)
  assert.match(detail, /buildWhatsAppOrderUrl/)
  assert.match(detail, /solicitar o cancelamento do pedido/)
  assert.match(detail, /order\.orderNumber/)
  assert.match(detail, /Solicitar cancelamento/)
  assert.match(detail, /cancellationUrl\s*\?\s*\(/)

  assert.doesNotMatch(detail, /fetch\([^\n]*cancel/i)
  assert.doesNotMatch(detail, /api\/.*cancel/i)
  assert.doesNotMatch(detail, /refund/i)
})
