import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("customer account mutations stay same-origin rate-limited bounded and private", async () => {
  const routes = [
    "../app/api/account/login/route.ts",
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
  assert.match(products, /admin-catalog-write/)
  assert.match(products, /private,\s*no-store/i)

  assert.match(imageRoute, /authorizeAdminAccess\(\{\s*touch:\s*true\s*\}\)/)
  assert.match(images, /isAllowedCheckoutOrigin/)
  assert.match(images, /admin-catalog-image-upload/)
  assert.match(images, /private,\s*no-store/i)

  assert.match(settingsRoute, /authorizeAdminAccess\(\{\s*touch:\s*true\s*\}\)/)
  assert.match(settings, /isAllowedCheckoutOrigin/)
  assert.match(settings, /readJsonBody\(request,\s*BODY_LIMIT_BYTES\)/)
  assert.match(settings, /admin-store-settings-write/)
  assert.match(settings, /private,\s*no-store/i)
})

test("shipment spending stays touched-admin same-origin replay-guarded and tightly rate limited", async () => {
  const [route, actions] = await Promise.all([
    source("../app/api/internal/admin/shipments/[id]/purchase/route.ts"),
    source("../lib/server/admin-shipment-actions.ts"),
  ])

  assert.match(route, /authorizeAdminAccess\(\{\s*touch:\s*true\s*\}\)/)
  assert.match(route, /scope:\s*["']admin-shipping-spend["']/)
  assert.match(route, /purchaseAdminShipment/)

  assert.match(actions, /isAllowedCheckoutOrigin/)
  assert.match(actions, /x-proxybembem-admin-action/i)
  assert.match(actions, /admin-shipment-mutation/)
  assert.match(actions, /admin-shipment-purchase/)
  assert.match(actions, /no-store/i)
})

test("notification worker and manual resend retain cron/admin authority", async () => {
  const [worker, resendRoute, resendActions] = await Promise.all([
    source("../app/api/internal/notifications/process/route.ts"),
    source("../app/api/internal/admin/orders/[id]/notifications/[notificationId]/resend/route.ts"),
    source("../lib/server/admin-order-notification-actions.ts"),
  ])

  assert.match(worker, /Authorization/i)
  assert.match(worker, /x-cron-auth/i)
  assert.match(worker, /timingSafeEqual/)
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
