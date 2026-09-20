import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("customer login next sanitizer allows dedicated checkout as a local continuation", async () => {
  const actions = await import("../lib/server/customer-account-actions.ts")

  assert.equal(actions.sanitizeCustomerLoginNext("/checkout"), "/checkout")
  assert.equal(
    actions.sanitizeCustomerLoginNext("/produtos?categoria=decks"),
    "/produtos?categoria=decks",
  )

  for (const unsafe of [
    "https://evil.example/checkout",
    "//evil.example/checkout",
    "/admin",
    "javascript:alert(1)",
  ]) {
    assert.equal(actions.sanitizeCustomerLoginNext(unsafe), "/minha-conta")
  }
})

test("checkout requires customer authentication before rendering delivery fields", async () => {
  const page = await source("../app/checkout/page.tsx")

  assert.match(page, /requireCustomerPageAccess\(["']\/checkout["']\)/)
  assert.match(page, /getOwnCustomerProfile/)
  assert.match(page, /listOwnCustomerAddresses/)
  assert.match(page, /customerPrefill/)
  assert.doesNotMatch(page, /getOptionalCustomerIdentity/)
})

test("cart stores only a short-lived CEP and selected freight preview before authenticated checkout", async () => {
  const cart = await source("../components/cart-panel.tsx")
  const checkout = await source("../components/checkout-page.tsx")

  assert.match(cart, /proxybembem-checkout-preview-v2/)
  assert.match(cart, /savedAt:\s*Date\.now\(\)/)
  assert.match(cart, /cep:\s*destinationCep/)
  assert.match(cart, /shippingServiceId:\s*shipping\.selectedShipping\.serviceId/)
  assert.match(cart, /window\.location\.assign\(["']\/checkout["']\)/)
  assert.match(cart, /try\s*\{[\s\S]*localStorage\.setItem[\s\S]*\}\s*catch/)
  assert.match(checkout, /try\s*\{[\s\S]*localStorage\.removeItem\(CHECKOUT_PREVIEW_KEY\)[\s\S]*\}\s*catch/)

  assert.ok(checkout.includes("readCheckoutPreview(window.localStorage)"))
  assert.match(checkout, /CHECKOUT_PREVIEW_TTL_MS/)
  assert.match(checkout, /formatCep\(preview\.cep\)/)
  assert.match(checkout, /restoredShippingServiceIdRef/)
  assert.doesNotMatch(checkout, /checkout-login-draft|saveCheckoutLoginDraft|readCheckoutLoginDraft/)
})

test("checkout reuses account identity and saved addresses, and can save a new address", async () => {
  const checkout = await source("../components/checkout-page.tsx")
  const form = await source("../components/checkout-form.tsx")

  assert.match(checkout, /customerPrefill\.email/)
  assert.match(checkout, /selectCheckoutSavedAddress/)
  assert.match(checkout, /selectedSavedAddressId/)
  assert.match(checkout, /saveCheckoutAddressForFuture/)
  assert.match(checkout, /fetch\(["']\/api\/account\/addresses["']/)
  assert.match(checkout, /savedAddresses\.length === 0 \? "Principal"/)

  assert.match(form, /readOnly/)
  assert.match(form, /Onde você quer receber\?/)
  assert.match(form, /\+ Usar outro endereço/)
  assert.match(form, /Salvar este endereço para próximas compras/)
  assert.match(form, /selectedSavedAddress/)
})

test("signup and confirmation preserve checkout continuation until the customer can log in", async () => {
  const loginForm = await source("../components/account/login-form.tsx")
  const signupPage = await source("../app/criar-conta/page.tsx")
  const signupForm = await source("../components/account/signup-form.tsx")
  const signupRoute = await source("../app/api/account/signup/route.ts")
  const received = await source("../app/cadastro-recebido/page.tsx")
  const callback = await source("../app/auth/callback/route.ts")

  assert.match(loginForm, /\/criar-conta\?next=/)
  assert.match(signupPage, /sanitizeCustomerLoginNext/)
  assert.match(signupPage, /AccountSignupForm next=\{next\}/)
  assert.match(signupForm, /JSON\.stringify\(input\)/)
  assert.match(signupForm, /cadastro-recebido\?next=/)
  assert.match(signupRoute, /encodeURIComponent\(input\.next\)/)
  assert.match(received, /ConfirmationResendForm next=\{next\}/)
  assert.match(callback, /sanitizeCustomerLoginNext/)
  assert.match(callback, /confirmado=1&next=/)
})


test("checkout and login are dynamic and checkout bypasses prefetch cache", async () => {
  const checkoutLayout = await source("../app/checkout/layout.tsx")
  const loginLayout = await source("../app/entrar/layout.tsx")
  const proxy = await source("../proxy.ts")
  const supabaseProxy = await source("../lib/supabase/proxy.ts")

  assert.match(checkoutLayout, /dynamic\s*=\s*["']force-dynamic["']/)
  assert.match(loginLayout, /dynamic\s*=\s*["']force-dynamic["']/)
  assert.match(proxy, /["']\/checkout["']/)
  assert.match(supabaseProxy, /CUSTOMER_AUTH_SENSITIVE_PATHS/)
  assert.match(supabaseProxy, /["']\/checkout["']/)
  assert.match(supabaseProxy, /private, no-cache, no-store, max-age=0, must-revalidate/)
})
