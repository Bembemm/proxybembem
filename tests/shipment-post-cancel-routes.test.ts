import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("post route is explicit AAL2 same-origin admin mutation only", async () => {
  const route = new URL(
    "../app/api/internal/admin/shipments/[id]/post/route.ts",
    import.meta.url,
  )
  const text = await readFile(route, "utf8")
  assert.match(text, /runtime\s*=\s*["']nodejs["']/)
  assert.match(text, /export\s+(?:async\s+function|const)\s+POST/)
  assert.doesNotMatch(text, /export\s+(?:async\s+function|const)\s+GET/)
  assert.match(text, /isAllowedCheckoutOrigin/)
  assert.match(text, /authorizeAdminAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)
  assert.match(text, /admin-shipping-mutation/)
  assert.match(text, /postAdminShipment/)
  assert.match(text, /no-store/i)
  assert.doesNotMatch(text, /purchaseMelhorEnvioShipment|generateMelhorEnvioShipment|cancelMelhorEnvioShipment/)
})

test("cancel route requires strong explicit confirmation before cancellation orchestration", async () => {
  const route = new URL(
    "../app/api/internal/admin/shipments/[id]/cancel/route.ts",
    import.meta.url,
  )
  const text = await readFile(route, "utf8")
  assert.match(text, /runtime\s*=\s*["']nodejs["']/)
  assert.match(text, /export\s+(?:async\s+function|const)\s+POST/)
  assert.doesNotMatch(text, /export\s+(?:async\s+function|const)\s+GET/)
  assert.match(text, /isAllowedCheckoutOrigin/)
  assert.match(text, /authorizeAdminAccess\s*\(\s*\{\s*touch:\s*true\s*\}\s*\)/)
  assert.match(text, /admin-shipping-mutation/)
  assert.match(text, /cancelAdminShipment/)
  assert.match(text, /cancel-label/)
  assert.match(text, /confirmation/)
  assert.match(text, /no-store/i)
  assert.doesNotMatch(text, /purchaseMelhorEnvioShipment|generateMelhorEnvioShipment/)
})
