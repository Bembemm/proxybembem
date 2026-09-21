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

test("customer payment reconciliation is owner-scoped same-origin and provider-authoritative", async () => {
  const route = await source(
    "../app/api/orders/[id]/reconcile-payment/route.ts",
  )
  const limits = await source("../lib/server/rate-limit.ts")

  const auth = route.indexOf("getOptionalCustomerIdentity()")
  const lookup = route.indexOf("getOrderByIdForCustomer(id, identity.userId)")
  const reconcile = route.indexOf("reconcileMercadoPagoOrderPayment({")

  assert.ok(auth >= 0)
  assert.ok(lookup > auth)
  assert.ok(reconcile > lookup)

  assert.match(route, /export\s+async\s+function\s+POST/)
  assert.doesNotMatch(route, /export\s+async\s+function\s+GET/)
  assert.match(route, /isSameOriginAccountRequest/)
  assert.match(route, /scope:\s*["']customer-payment-reconcile["']/)
  assert.match(route, /getServerEnv/)
  assert.match(route, /currentPaymentId:\s*order\.payment_id/)
  assert.match(route, /currentPaymentStatus:\s*order\.payment_status/)
  assert.match(route, /private, no-cache, no-store, max-age=0, must-revalidate/)
  assert.doesNotMatch(route, /request\.json\s*\(/)
  assert.doesNotMatch(route, /searchParams\.get\s*\(/)

  assert.match(limits, /"customer-payment-reconcile"/)
  assert.match(
    limits,
    /"customer-payment-reconcile":\s*\{\s*limit:\s*12,\s*windowSeconds:\s*300\s*\}/,
  )
})

test("Mercado Pago return UI retries verification without trusting browser payment fields", async () => {
  const customer = await source("../app/minha-conta/pedidos/[id]/page.tsx")
  const reconciler = await source(
    "../components/account/payment-return-reconciler.tsx",
  )
  const admin = await source("../app/admin/pedidos/[id]/page.tsx")

  assert.match(customer, /PaymentReturnReconciler/)
  assert.match(customer, /MERCADO_PAGO_RETURN_SIGNAL_KEYS/)
  assert.doesNotMatch(customer, /Já paguei — atualizar status/)
  assert.match(reconciler, /method:\s*["']POST["']/)
  assert.match(reconciler, /RETRY_DELAYS_MS/)
  assert.match(reconciler, /router\.refresh\(\)/)
  assert.match(reconciler, /não pague novamente/i)
  assert.match(
    reconciler,
    /\/api\/orders\/\$\{encodeURIComponent\(orderId\)\}\/reconcile-payment/,
  )

  assert.match(admin, /Sincronizar com Mercado Pago/)
  assert.match(
    admin,
    /\/api\/internal\/admin\/orders\/\$\{order\.id\}\/reconcile-payment/,
  )
  assert.match(admin, /não marca pagamento manualmente/)
})
