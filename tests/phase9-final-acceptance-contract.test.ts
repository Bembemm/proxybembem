import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("final smoke records Phase 4 product-admin owner acceptance", async () => {
  const doc = await source("../docs/superpowers/phase-9/FINAL_MANUAL_SMOKE.md")

  assert.match(doc, /Phase 4 product-admin historical debt/i)
  assert.match(doc, /Status:\s*OWNER ACCEPTED \/ PRODUCTION OBSERVED/i)
  for (const evidence of [
    "tests/admin-product-routes.test.ts",
    "tests/admin-product-images.test.ts",
    "tests/admin-product-editor-ui.test.ts",
  ]) {
    assert.match(doc, new RegExp(evidence.replaceAll(".", "\\.")))
  }
  assert.match(doc, /two tabs/i)
  assert.match(doc, /public catalog/i)
  assert.match(doc, /PASS — owner-reported/i)
})

test("final smoke records Phase 8 dashboard Production acceptance", async () => {
  const doc = await source("../docs/superpowers/phase-9/FINAL_MANUAL_SMOKE.md")

  assert.match(doc, /Phase 8 authenticated dashboard debt/i)
  assert.match(doc, /Status:\s*OWNER ACCEPTED \/ PRODUCTION ACCEPTED/i)
  assert.match(doc, /tests\/admin-dashboard-ui\.test\.ts/)
  assert.match(doc, /tests\/admin-dashboard-repository\.test\.ts/)
  assert.match(doc, /\/admin\/pedidos\?attention=1/)
  assert.match(doc, /synthetic zeros/i)
  assert.match(doc, /raw attention metadata/i)
  assert.match(doc, /not publicly cacheable/i)
})

test("final Phase 9 smoke records auth ownership settings shipping notifications and public health acceptance", async () => {
  const doc = await source("../docs/superpowers/phase-9/FINAL_MANUAL_SMOKE.md")

  assert.match(doc, /Final Phase 9 Production smoke/i)
  assert.match(doc, /OWNER ACCEPTED \/ PRODUCTION ACCEPTED \/ FINAL CANDIDATE DEPLOYED/i)
  assert.match(doc, /customer can view only their own private order/i)
  assert.match(doc, /verified authenticated customer/i)
  assert.match(doc, /MFA\/AAL2 \+ active app-session/i)
  assert.match(doc, /Store Settings/i)
  assert.match(doc, /MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false/)
  assert.match(doc, /Transactional notification/i)
  assert.match(doc, /HTTP 200/i)
})

test("manual acceptance remains distinct from automated evidence", async () => {
  const smoke = await source("../docs/superpowers/phase-9/FINAL_MANUAL_SMOKE.md")
  const acceptance = await source("../docs/superpowers/phase-9/FINAL_ACCEPTANCE.md")

  assert.match(smoke, /automated evidence and owner-observed evidence are deliberately separate/i)
  assert.match(smoke, /owner explicitly reported completion of the full manual checklist/i)
  assert.match(acceptance, /owner-reported/i)
  assert.match(acceptance, /cdb3f863336237ab49f9b91cca20f0d876aa75c7/)
  assert.match(acceptance, /not integrated into `main`/i)
})
