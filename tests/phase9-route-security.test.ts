import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("customer account mutations stay same-origin rate-limited bounded and private", async () => {
  const routes = [
    "../app/api/account/signup/route.ts",
    "../app/api/account/profile/route.ts",
    "../app/api/account/password/route.ts",
    "../app/api/account/password-reset/route.ts",
    "../app/api/account/password-recovery/route.ts",
  ]

  for (const path of routes) {
    const route = await source(path)
    assert.match(route, /isSameOriginAccountRequest/)
    assert.match(route, /consumeRateLimit/)
    assert.match(route, /readJsonBody\(request,\s*4_096\)/)
    assert.match(route, /private,\s*no-store/i)
  }

  const login = await source("../app/api/account/login/route.ts")
  assert.match(login, /isSameOriginAccountRequest/)
  assert.match(login, /consumeRateLimit/)
  assert.match(login, /readUrlEncodedBody\(request,\s*4_096\)/)
  assert.match(login, /keys\.length\s*!==\s*3/)
  assert.match(login, /private,\s*no-store/i)
})

test("checkout keeps origin authenticated-customer abuse and cache boundaries", async () => {
  const route = await source("../app/api/checkout/route.ts")

  assert.match(route, /isAllowedCheckoutOrigin/)
  assert.match(route, /getOptionalCustomerIdentity/)
  assert.match(route, /authentication_required/)
  assert.match(route, /consumeRateLimit/)
  assert.match(route, /scope:\s*["']checkout["']/)
  assert.match(route, /readJsonBody\(request/)
  assert.match(route, /Cache-Control["']?\s*[,\]:]\s*["']no-store["']/i)
})

test("admin catalog images and settings retain touched auth same-origin bounded writes", async () => {
  const [products, imageRoute, images, settingsRoute, settings] = await Promise.all([
    source("../lib/server/admin-product-actions.ts"),
    source("../app/api/admin/products/image-upload/route.ts"),
    source("../lib/server/product-images.ts"),
    source("../app/api/admin/settings/route.ts"),
    source("../lib/server/admin-store-settings-actions.ts"),
  ])

  assert.match(products, /isAllowedCheckoutOrigin/)
  assert.match(products, /readJsonBody\(request,\s*PRODUCT_BODY_LIMIT\)/)
  assert.match(products, /private,\s*no-store/i)

  assert.match(imageRoute, /authorizeAdminAccess\(\{\s*touch:\s*true\s*\}\)/)
  assert.match(images, /isAllowedCheckoutOrigin/)
  assert.match(images, /readJsonBody\(request,\s*PRODUCT_IMAGE_METADATA_BODY_LIMIT\)/)
  assert.match(images, /private,\s*no-store/i)

  assert.match(settingsRoute, /authorizeAdminAccess\(\{\s*touch:\s*true\s*\}\)/)
  assert.match(settings, /isAllowedCheckoutOrigin/)
  assert.match(settings, /readJsonBody\(request,\s*BODY_LIMIT_BYTES\)/)
  assert.match(settings, /private,\s*no-store/i)
})

test("shipment preparation stays touched-admin same-origin rate-limited and no-spend", async () => {
  const [route, actions, client] = await Promise.all([
    source("../app/api/internal/admin/orders/[id]/shipment/prepare/route.ts"),
    source("../lib/server/admin-shipment-actions.ts"),
    source("../lib/server/melhor-envio-shipment-client.ts"),
  ])

  assert.match(route, /authorizeAdminAccess\(\{\s*touch:\s*true\s*\}\)/)
  assert.match(route, /prepareAdminShipment/)
  assert.match(actions, /isAllowedCheckoutOrigin/)
  assert.match(actions, /consumeRateLimit/)
  assert.match(actions, /no-store/i)

  assert.match(client, /\/api\/v2\/me\/cart/)
  assert.doesNotMatch(client, /\/api\/v2\/me\/shipment\/checkout/)
  assert.doesNotMatch(client, /shipping-checkout|shipping-generate|shipping-print|shipping-tracking|shipping-cancel/)
})

test("notification worker and manual resend retain cron/admin authority", async () => {
  const [worker, resendRoute, resendActions] = await Promise.all([
    source("../app/api/internal/notifications/process/route.ts"),
    source("../app/api/internal/admin/orders/[id]/notifications/[notificationId]/resend/route.ts"),
    source("../lib/server/admin-order-notification-actions.ts"),
  ])

  assert.match(worker, /Authorization/i)
  assert.match(worker, /timingSafeSecretEqual/)
  assert.match(worker, /no-store/i)
  assert.doesNotMatch(worker, /consumeRateLimit/)

  assert.match(resendRoute, /authorizeAdminAccess\(\{\s*touch:\s*true\s*\}\)/)
  assert.match(resendActions, /isAllowedCheckoutOrigin/)
  assert.match(resendActions, /private,\s*no-store/i)
})

test("provider webhooks use signature replay-dedupe controls instead of naive IP limiting", async () => {
  const [mercadoPago, resendRoute, resend] = await Promise.all([
    source("../app/api/mercadopago/webhook/route.ts"),
    source("../app/api/webhooks/resend/route.ts"),
    source("../lib/server/resend-webhook.ts"),
  ])

  assert.match(mercadoPago, /validateMercadoPagoWebhookSignature/)
  assert.match(mercadoPago, /readJsonBody\(request,\s*8_192\)/)
  assert.match(mercadoPago, /applyMercadoPagoPaymentEvent/)
  assert.doesNotMatch(mercadoPago, /consumeRateLimit/)

  assert.match(resendRoute, /createResendWebhookHandler/)
  assert.match(resend, /verifyResendWebhook/)
  assert.match(resend, /WEBHOOK_TOLERANCE_SECONDS\s*=\s*300/)
  assert.match(resend, /WEBHOOK_MAX_BYTES\s*=\s*65_536/)
  assert.match(resend, /record_notification_webhook/)
  assert.match(resend, /Cache-Control["']?\s*:\s*["']no-store["']/i)
  assert.doesNotMatch(resend, /consumeRateLimit/)
})


test("customer identity and checkout data never use shared server caches", async () => {
  const privateSources = await Promise.all([
    source("../lib/server/customer-auth.ts"),
    source("../lib/server/customer-profiles.ts"),
    source("../lib/server/customer-addresses.ts"),
    source("../lib/server/customer-orders.ts"),
    source("../app/checkout/page.tsx"),
  ])

  for (const text of privateSources) {
    assert.doesNotMatch(text, /unstable_cache|force-cache|stale-while-revalidate|s-maxage/i)
  }

  const accountLayout = await source("../app/minha-conta/layout.tsx")
  const checkoutLayout = await source("../app/checkout/layout.tsx")
  const proxy = await source("../lib/supabase/proxy.ts")

  assert.match(accountLayout, /dynamic\s*=\s*["']force-dynamic["']/)
  assert.match(checkoutLayout, /dynamic\s*=\s*["']force-dynamic["']/)
  assert.match(proxy, /CUSTOMER_AUTH_SENSITIVE_PATHS/)
  assert.match(proxy, /private, no-cache, no-store, max-age=0, must-revalidate/)
})
