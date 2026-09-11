import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import test from "node:test"

const REMOVED_PUBLIC_SURFACES = [
  "../app/pedido/[token]/page.tsx",
  "../components/account/order-claim-form.tsx",
  "../app/api/account/orders/claim/route.ts",
  "../lib/server/customer-order-claim.ts",
] as const

async function exists(path: string) {
  try {
    await access(new URL(path, import.meta.url))
    return true
  } catch {
    return false
  }
}

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("public order and guest claim application surfaces are absent", async () => {
  for (const path of REMOVED_PUBLIC_SURFACES) {
    assert.equal(await exists(path), false, `${path} must be removed`)
  }
})

test("active order navigation is private-account only", async () => {
  const checkoutFlow = await source("../lib/server/checkout-flow.ts")
  const accountActions = await source("../lib/server/customer-account-actions.ts")
  const orders = await source("../lib/server/orders.ts")

  assert.doesNotMatch(checkoutFlow, /\/pedido\//)
  assert.match(checkoutFlow, /\/minha-conta\/pedidos\//)
  assert.doesNotMatch(accountActions, /PUBLIC_ORDER_PATH_RE|\/pedido\//)
  assert.doesNotMatch(orders, /export\s+async\s+function\s+getOrderByPublicToken/)
})
