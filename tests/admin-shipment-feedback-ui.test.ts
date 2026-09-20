import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("admin order detail renders sanitized feedback returned by shipment actions", async () => {
  const page = await readFile(
    new URL("../app/admin/pedidos/[id]/page.tsx", import.meta.url),
    "utf8",
  )

  assert.match(page, /shipment\?:\s*string\s*\|\s*string\[\]/)
  assert.match(page, /query\.shipment/)

  for (const status of [
    "prepared",
    "sender-missing",
    "shipment-invalid",
    "shipment-busy",
    "provider-rejected",
    "reauthorization-required",
    "shipment-attention",
  ]) {
    assert.match(page, new RegExp(`(?:["']${status}["']|\\b${status}\\b)\\s*:`), status)
  }

  assert.match(page, /dados[^\n]*remessa[^\n]*incompletos|remessa[^\n]*dados[^\n]*incompletos/i)
  assert.match(page, /CPF[^\n]*destinatário|destinatário[^\n]*CPF/i)
  assert.match(page, /shipmentFeedbackMessage/)

  // Never reflect arbitrary query-string values directly into the admin UI.
  assert.doesNotMatch(page, /\{\s*firstParam\(query\.shipment\)\s*\}/)
})
