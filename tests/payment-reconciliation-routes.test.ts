import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("admin payment reconciliation retains touched AAL2 admin auth and same-origin protection", async () => {
  const route = await source(
    "../app/api/internal/admin/orders/[id]/reconcile-payment/route.ts",
  )

  assert.match(route, /authorizeAdminAccess\(\{\s*touch:\s*true\s*\}\)/)
  assert.match(route, /isAllowedCheckoutOrigin/)
  assert.match(route, /getAdminOrderById/)
  assert.match(route, /scope:\s*["']payment-reconcile["']/)
  assert.match(route, /reconcileMercadoPagoOrderPayment/)
  assert.match(route, /private, no-cache, no-store, max-age=0, must-revalidate/)
  assert.doesNotMatch(route, /payment_status\s*:/)
})

test("payment reconciliation is exposed only to the admin surface", async () => {
  const customer = await source("../app/minha-conta/pedidos/[id]/page.tsx")
  const admin = await source("../app/admin/pedidos/[id]/page.tsx")

  assert.doesNotMatch(customer, /Já paguei — atualizar status/)
  assert.doesNotMatch(customer, /reconcile-payment/)
  assert.match(admin, /Sincronizar com Mercado Pago/)
  assert.match(
    admin,
    /\/api\/internal\/admin\/orders\/\$\{order\.id\}\/reconcile-payment/,
  )
  assert.match(admin, /não marca pagamento manualmente/)
})
