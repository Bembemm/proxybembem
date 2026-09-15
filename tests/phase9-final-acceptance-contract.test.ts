import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("final smoke keeps historical Phase 4 product-admin debt explicit", async () => {
  const doc = await source("../docs/superpowers/phase-9/FINAL_MANUAL_SMOKE.md")

  assert.match(doc, /Phase 4 product-admin historical debt/i)
  assert.match(doc, /Status:\s*PENDING OWNER SMOKE/i)
  for (const evidence of [
    "tests/admin-product-routes.test.ts",
    "tests/admin-product-images.test.ts",
    "tests/admin-product-editor-ui.test.ts",
  ]) {
    assert.match(doc, new RegExp(evidence.replaceAll(".", "\\.")))
  }
  assert.match(doc, /two tabs/i)
  assert.match(doc, /public catalog/i)
})

test("final smoke keeps inherited Phase 8 dashboard acceptance pending", async () => {
  const doc = await source("../docs/superpowers/phase-9/FINAL_MANUAL_SMOKE.md")

  assert.match(doc, /Phase 8 authenticated dashboard debt/i)
  assert.match(doc, /Phase 8[\s\S]*?Status:\s*PENDING OWNER SMOKE/i)
  assert.match(doc, /tests\/admin-dashboard-ui\.test\.ts/)
  assert.match(doc, /tests\/admin-dashboard-repository\.test\.ts/)
  assert.match(doc, /\/admin\/pedidos\?attention=1/)
  assert.match(doc, /synthetic zeros/i)
  assert.match(doc, /raw attention metadata/i)
  assert.match(doc, /authenticated\/private response caching behavior/i)
})

test("final Phase 9 smoke covers auth ownership settings shipping notifications and public health", async () => {
  const doc = await source("../docs/superpowers/phase-9/FINAL_MANUAL_SMOKE.md")

  assert.match(doc, /Final Phase 9 Production smoke/i)
  assert.match(doc, /PENDING OWNER SMOKE \/ WAITING FINAL CANDIDATE DEPLOY/i)
  assert.match(doc, /customer can view only their own private order/i)
  assert.match(doc, /verified authenticated customer/i)
  assert.match(doc, /MFA\/AAL2 \+ active app-session/i)
  assert.match(doc, /Store Settings/i)
  assert.match(doc, /MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false/)
  assert.match(doc, /Transactional notification/i)
  assert.match(doc, /HTTP 200/i)
})

test("manual acceptance cannot be inferred from automated green evidence", async () => {
  const doc = await source("../docs/superpowers/phase-9/FINAL_MANUAL_SMOKE.md")

  assert.match(doc, /automated evidence and owner-observed evidence are deliberately separate/i)
  assert.match(doc, /Do not edit `PENDING OWNER SMOKE` to accepted based on automated tests/i)
  assert.match(doc, /must not be described as fully Production accepted/i)
  assert.match(doc, /tests\/private-order-only\.test\.ts/)
})
