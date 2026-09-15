import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

async function exists(path: string) {
  try {
    await access(new URL(path, import.meta.url))
    return true
  } catch {
    return false
  }
}

test("final hardening keeps admin AAL2 and active app-session authorization", async () => {
  const auth = await source("../lib/server/admin-auth.ts")

  assert.match(auth, /requireAal2:\s*true/)
  assert.match(auth, /authorizeSession/)
  assert.match(auth, /fresh_login_required/)
  assert.match(auth, /maxAgeSeconds:\s*600/)
})

test("checkout keeps same-origin rate limiting and trusted verified customer identity", async () => {
  const [route, customerAuth] = await Promise.all([
    source("../app/api/checkout/route.ts"),
    source("../lib/server/customer-auth.ts"),
  ])

  assert.match(route, /consumeRateLimit/)
  assert.match(route, /scope:\s*["']checkout["']/)
  assert.match(route, /isAllowedCheckoutOrigin/)
  assert.match(route, /getOptionalCustomerIdentity/)
  assert.match(route, /authentication_required/)
  assert.match(route, /Cache-Control["']?\s*[,\]:]\s*["']no-store["']/i)

  assert.match(customerAuth, /email_confirmed_at/)
  assert.match(customerAuth, /emailVerified:\s*true/)
  assert.match(customerAuth, /supabase\.auth\.getUser\s*\(/)
})

test("customer profile ownership stays on authenticated SSR and RLS", async () => {
  const profiles = await source("../lib/server/customer-profiles.ts")

  assert.match(profiles, /createSupabaseServerClient/)
  assert.match(profiles, /auth\.getUser\s*\(/)
  assert.match(profiles, /from\(["']customer_profiles["']\)/)
  assert.doesNotMatch(
    profiles,
    /SUPABASE_SECRET_KEY|service[_-]?role|getSupabaseEnv|customer_id\s*:/i,
  )
})

test("admin product image and settings mutations retain same-origin protected boundaries", async () => {
  const [products, imageRoute, settingsRoute, settingsActions] = await Promise.all([
    source("../lib/server/admin-product-actions.ts"),
    source("../app/api/admin/products/image-upload/route.ts"),
    source("../app/api/admin/settings/route.ts"),
    source("../lib/server/admin-store-settings-actions.ts"),
  ])

  assert.match(products, /isAllowedCheckoutOrigin/)
  assert.match(products, /private,\s*no-store/i)
  assert.match(products, /readJsonBody\(request,\s*PRODUCT_BODY_LIMIT\)/)

  assert.match(imageRoute, /authorizeAdminAccess\(\{\s*touch:\s*true\s*\}\)/)
  assert.doesNotMatch(imageRoute, /SUPABASE_SECRET_KEY/)

  assert.match(settingsRoute, /authorizeAdminAccess\(\{\s*touch:\s*true\s*\}\)/)
  assert.match(settingsActions, /isAllowedCheckoutOrigin/)
  assert.match(settingsActions, /private,\s*no-store/i)
  assert.match(settingsActions, /readJsonBody\(request,\s*BODY_LIMIT_BYTES\)/)
})

test("shipment purchase stays explicit fail-closed and ambiguous provider outcomes require attention", async () => {
  const [lifecycle, noAutoSpend] = await Promise.all([
    source("../lib/server/shipment-lifecycle-service.ts"),
    source("./shipment-no-auto-spend.test.ts"),
  ])

  assert.match(lifecycle, /labelPurchaseEnabled/)
  assert.match(lifecycle, /if\s*\(!config\.labelPurchaseEnabled\)/)
  assert.match(lifecycle, /outcome:\s*["']purchase_disabled["']/)
  assert.match(lifecycle, /purchase_outcome_unknown/)
  assert.match(lifecycle, /must never be retried merely because local persistence is uncertain/i)

  assert.match(noAutoSpend, /payment webhook/)
  assert.match(noAutoSpend, /ready-to-ship/)
  assert.match(noAutoSpend, /doesNotMatch/)
  assert.match(noAutoSpend, /purchaseAdminShipment|purchaseMelhorEnvioShipment/)
})

test("dashboard remains protected read-only server presentation with explicit failure", async () => {
  const [page, attention] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../components/admin/dashboard-attention-center.tsx"),
  ])

  assert.match(page, /dynamic\s*=\s*["']force-dynamic["']/)
  assert.match(page, /requireAdminPageAccess\(\{\s*touch:\s*true\s*\}\)/)
  assert.match(page, /getAdminDashboardSnapshot\s*\(/)
  assert.match(page, /Não foi possível carregar os indicadores agora/)
  assert.match(page, /Os dados não foram substituídos por zeros/)
  assert.doesNotMatch(page, /\bfetch\s*\(/)

  assert.match(attention, /getAttentionReasonLabel/)
  assert.doesNotMatch(attention, /item\.metadata|JSON\.stringify/)
  assert.doesNotMatch(attention, /<form\b/i)
})

test("guest order surfaces remain retired", async () => {
  for (const path of [
    "../app/pedido/[token]/page.tsx",
    "../app/api/account/orders/claim/route.ts",
    "../lib/server/customer-order-claim.ts",
  ]) {
    assert.equal(await exists(path), false, `${path} must remain absent`)
  }
})

test("admin browser components contain no server credential names or local persistence bypass", async () => {
  const clientFiles = [
    "../app/admin/login/login-form.tsx",
    "../app/admin/setup-mfa/setup-mfa-form.tsx",
    "../app/admin/mfa/mfa-form.tsx",
    "../components/admin/admin-mobile-nav.tsx",
  ]

  for (const path of clientFiles) {
    const text = await source(path)
    assert.doesNotMatch(
      text,
      /ADMIN_USER_ID|SUPABASE_SECRET_KEY|service_role|MELHOR_ENVIO_|RESEND_API_KEY|MERCADO_PAGO_ACCESS_TOKEN|localStorage/,
      `${path} exposes forbidden server material`,
    )
  }
})
