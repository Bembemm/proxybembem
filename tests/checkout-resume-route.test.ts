import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("resume-payment route is owner-scoped, expiry-aware, and redirects only to Mercado Pago", async () => {
  const route = await source("../app/api/orders/[id]/resume-payment/route.ts")
  const orders = await source("../lib/server/orders.ts")

  const auth = route.indexOf("getOptionalCustomerIdentity()")
  const lookup = route.indexOf("getOrderByIdForCustomer(id, identity.userId)")
  const redirect = route.indexOf("privateRedirect(order.checkout_url")

  assert.ok(auth >= 0)
  assert.ok(lookup > auth)
  assert.ok(redirect > lookup)

  assert.match(route, /canResumeCheckout/)
  assert.match(route, /isAllowedMercadoPagoCheckoutUrl/)
  assert.match(route, /dynamic\s*=\s*["']force-dynamic["']/)
  assert.match(route, /private, no-cache, no-store, max-age=0, must-revalidate/)
  assert.match(route, /Cache-Control/)
  assert.match(route, /privateRedirect\(order\.checkout_url\)/)
  assert.doesNotMatch(route, /payment_status\s*[:=]/)
  assert.doesNotMatch(route, /updateOrder|PATCH|applyMercadoPagoPaymentEvent/)

  assert.match(orders, /export async function getOrderByIdForCustomer/)
  assert.match(orders, /customer_id:\s*\x60eq\.\$\{customerId\}\x60/)
  assert.match(orders, /id:\s*\x60eq\.\$\{orderId\}\x60/)
})

test("customer order detail provides resume and branded unavailable states without trusting return parameters", async () => {
  const detail = await source("../app/minha-conta/pedidos/[id]/page.tsx")

  assert.match(detail, /Continuar pagamento/)
  assert.match(detail, /Checkout expirado/)
  assert.match(detail, /\/api\/orders\/\$\{order\.id\}\/resume-payment/)
  assert.match(detail, /Não foi possível carregar este pedido/)
  assert.match(detail, /Pedido não encontrado/)
  assert.doesNotMatch(detail, /searchParams.*payment_status/)
})
