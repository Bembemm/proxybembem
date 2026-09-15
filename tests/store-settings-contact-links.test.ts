import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("WhatsApp URL helper requires a canonical configured E.164 destination", async () => {
  const { buildWhatsAppOrderUrl } = await import("../lib/checkout.ts")
  const message = "Olá & tudo bem?"
  const url = buildWhatsAppOrderUrl("+5544991250332", message)

  assert.equal(url, `https://wa.me/5544991250332?text=${encodeURIComponent(message)}`)
  assert.equal(new URL(url!).pathname, "/5544991250332")

  for (const destination of [
    null,
    undefined,
    "5544991250332",
    "+55 44 99125-0332",
    "+0123456789",
    "+1234567",
    "+1234567890123456",
  ]) {
    assert.equal(buildWhatsAppOrderUrl(destination, message), null)
  }
})

test("floating WhatsApp contact receives the configured destination and checkout fallback remains optional", async () => {
  const shell = await source("../components/site-shell.tsx")
  const floating = await source("../components/whatsapp-button.tsx")
  const summary = await source("../components/order-summary.tsx")

  assert.match(
    shell,
    /<WhatsAppFloatingButton\s+contactWhatsappE164=\{storeSettings\.contactWhatsappE164\}\s*\/>/,
  )
  assert.match(floating, /contactWhatsappE164/)
  assert.match(floating, /https:\/\/wa\.me\//)
  assert.doesNotMatch(floating, /5544991250332/)

  assert.match(summary, /whatsappFallbackUrl:\s*string\s*\|\s*null/)
  assert.match(summary, /whatsappFallbackUrl\s*\?\s*\(/)
  assert.doesNotMatch(summary, /href=\{whatsappFallbackUrl\}[\s\S]*Prefiro continuar pelo WhatsApp[\s\S]*<\/Button>\s*\n\s*<div/)
})

test("contact page loads cached public settings and renders only configured channels", async () => {
  const page = await source("../app/contato/page.tsx")
  const contact = await source("../components/pages/contact-page.tsx")

  assert.match(page, /getPublicStoreSettings/)
  assert.match(page, /store-settings-cache/)
  assert.match(page, /export\s+default\s+async\s+function\s+ContatoPage/)
  assert.match(page, /const\s+storeSettings\s*=\s*await\s+getPublicStoreSettings\(\)/)
  assert.match(page, /contactEmail=\{storeSettings\.contactEmail\}/)
  assert.match(page, /contactWhatsappE164=\{storeSettings\.contactWhatsappE164\}/)

  assert.match(contact, /contactEmail:\s*string\s*\|\s*null/)
  assert.match(contact, /contactWhatsappE164:\s*string\s*\|\s*null/)
  assert.match(contact, /buildWhatsAppOrderUrl/)
  assert.match(contact, /contactEmail\s*\?\s*\(/)
  assert.match(contact, /whatsappUrl\s*\?\s*\(/)
  assert.doesNotMatch(contact, /5544991250332/)
  assert.doesNotMatch(contact, /contato@proxybembem\.com\.br/i)
})

test("private order support uses configured WhatsApp only after auth and own-order resolution", async () => {
  const detail = await source("../app/minha-conta/pedidos/[id]/page.tsx")

  assert.match(detail, /getPublicStoreSettings/)
  assert.match(detail, /store-settings-cache/)
  assert.match(
    detail,
    /buildWhatsAppOrderUrl\(\s*storeSettings\.contactWhatsappE164\s*,/,
  )
  assert.match(detail, /supportUrl\s*\?\s*\(/)
  assert.match(detail, /Falar sobre este pedido/)
  assert.doesNotMatch(detail, /5544991250332/)

  const auth = detail.indexOf("await requireCustomerPageAccess")
  const ownOrder = detail.indexOf("order = await getOwnOrderById")
  const settings = detail.indexOf("const storeSettings = await getPublicStoreSettings")

  assert.ok(auth >= 0)
  assert.ok(ownOrder > auth)
  assert.ok(settings > ownOrder)
})
