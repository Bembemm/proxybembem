import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("customer payment reconciliation stays owner-scoped same-origin rate-limited and private", async () => {
  const route = await source("../app/api/orders/[id]/reconcile-payment/route.ts")

  assert.match(route, /isSameOriginAccountRequest/)
  assert.match(route, /getOptionalCustomerIdentity/)
  assert.match(route, /getOrderByIdForCustomer/)
  assert.match(route, /scope:\s*["']payment-reconcile["']/)
  assert.match(route, /reconcileMercadoPagoOrderPayment/)
  assert.match(route, /private, no-cache, no-store, max-age=0, must-revalidate/)
  assert.doesNotMatch(route, /payment_status\s*:/)
})

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

test("customer and admin pending-payment surfaces expose provider-verified synchronization actions", async () => {
  const customer = await source("../app/minha-conta/pedidos/[id]/page.tsx")
  const admin = await source("../app/admin/pedidos/[id]/page.tsx")

  assert.match(customer, /Já paguei — atualizar status/)
  assert.match(customer, /\/api\/orders\/\$\{order\.id\}\/reconcile-payment/)
  assert.match(admin, /Sincronizar com Mercado Pago/)
  assert.match(
    admin,
    /\/api\/internal\/admin\/orders\/\$\{order\.id\}\/reconcile-payment/,
  )
  assert.match(admin, /não marca pagamento manualmente/)
})
