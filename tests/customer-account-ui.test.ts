import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

function requireSource(value: string, label: string) {
  assert.ok(value.length > 0, `missing ${label}`)
}

test("login next sanitizer allows only account pages and the products checkout continuation", async () => {
  const actions = await import("../lib/server/customer-account-actions.ts")

  for (const allowed of [
    "/minha-conta",
    "/minha-conta/perfil",
    "/minha-conta/pedidos",
    "/minha-conta/pedidos/11111111-1111-4111-8111-111111111111",
    "/minha-conta/seguranca?recovery=1",
    "/produtos",
    "/produtos?categoria=decks",
  ]) {
    assert.equal(actions.sanitizeCustomerLoginNext(allowed), allowed)
  }

  for (const unsafe of [
    "https://evil.example/minha-conta",
    "//evil.example/minha-conta",
    "/admin",
    "/checkout",
    "/pedido/abc",
    "javascript:alert(1)",
  ]) {
    assert.equal(actions.sanitizeCustomerLoginNext(unsafe), "/minha-conta")
  }
})

test("public auth pages use storefront account forms without admin UI", async () => {
  const login = await source("../app/entrar/page.tsx")
  const signup = await source("../app/criar-conta/page.tsx")
  const reset = await source("../app/esqueci-a-senha/page.tsx")

  requireSource(login, "/entrar")
  requireSource(signup, "/criar-conta")
  requireSource(reset, "/esqueci-a-senha")

  assert.match(login, /AccountLoginForm/)
  assert.match(login, /sanitizeCustomerLoginNext/)
  assert.match(signup, /AccountSignupForm/)
  assert.match(signup, /verific/i)
  assert.match(reset, /AccountPasswordResetForm/)
  assert.match(reset, /exist/i)

  for (const page of [login, signup, reset]) {
    assert.doesNotMatch(page, /components\/admin|AdminShell|requireAdminPageAccess/)
  }
})

test("public auth forms are accessible and call only the intended account APIs", async () => {
  const login = await source("../components/account/login-form.tsx")
  const signup = await source("../components/account/signup-form.tsx")
  const reset = await source("../components/account/password-reset-form.tsx")

  requireSource(login, "login form")
  requireSource(signup, "signup form")
  requireSource(reset, "password reset form")

  assert.match(login, /\/api\/account\/login/)
  assert.match(login, /htmlFor=["']email["']/)
  assert.match(login, /htmlFor=["']password["']/)
  assert.match(login, /type=["']email["']/)
  assert.match(login, /type=["']password["']/)
  assert.match(login, /window\.location\.assign\(next\)/)

  assert.match(signup, /\/api\/account\/signup/)
  for (const field of ["name", "email", "whatsapp", "password"]) {
    assert.match(signup, new RegExp(`htmlFor=["']${field}["']`))
  }
  assert.match(signup, /type=["']email["']/)
  assert.match(signup, /type=["']password["']/)

  assert.match(reset, /\/api\/account\/password-reset/)
  assert.match(reset, /htmlFor=["']email["']/)
  assert.match(reset, /type=["']email["']/)

  for (const form of [login, signup, reset]) {
    assert.doesNotMatch(form, /customerId|customer_id|ADMIN_USER_ID/)
  }
})

test("signup keeps a stable form reference across await and never reports provider errors as accepted", async () => {
  const form = await source("../components/account/signup-form.tsx")
  const route = await source("../app/api/account/signup/route.ts")

  assert.match(form, /const formElement = event\.currentTarget/)
  assert.match(form, /new FormData\(formElement\)/)
  assert.doesNotMatch(form, /new FormData\(event\.currentTarget\)[\s\S]{0,800}event\.currentTarget\.reset\(\)/)
  assert.doesNotMatch(route, /catch\s*\{\s*return json\(202/)
})

test("customer account shell stays structural while leaf pages own server protection", async () => {
  const layout = await source("../app/minha-conta/layout.tsx")
  const overview = await source("../app/minha-conta/page.tsx")
  const orders = await source("../app/minha-conta/pedidos/page.tsx")
  const detail = await source("../app/minha-conta/pedidos/[id]/page.tsx")
  const profile = await source("../app/minha-conta/perfil/page.tsx")
  const security = await source("../app/minha-conta/seguranca/page.tsx")

  assert.doesNotMatch(layout, /requireCustomerPageIdentity/)
  assert.doesNotMatch(layout, /redirect\s*\(/)

  for (const page of [overview, orders, detail, profile, security]) {
    assert.match(page, /requireCustomerPageIdentity/)
  }
})

test("account overview and order pages read only own curated repositories", async () => {
  const overview = await source("../app/minha-conta/page.tsx")
  const orders = await source("../app/minha-conta/pedidos/page.tsx")
  const detail = await source("../app/minha-conta/pedidos/[id]/page.tsx")

  assert.match(overview, /listCustomerOrders/)
  assert.match(orders, /listCustomerOrders/)
  assert.match(detail, /getCustomerOrder/)
  assert.doesNotMatch([overview, orders, detail].join("\n"), /getOrderByPublicToken|public_token/)
})

test("profile save is an explicit same-origin POST using only own validated profile fields", async () => {
  const profileForm = await source("../components/account/profile-form.tsx")
  const route = await source("../app/api/account/profile/route.ts")

  assert.match(profileForm, /\/api\/account\/profile/)
  assert.match(route, /requireCustomerPageIdentity|getOptionalCustomerIdentity/)
  assert.match(route, /parseCustomerProfileInput/)
  assert.doesNotMatch(route, /customerId|customer_id/)
})

test("security page exposes read-only email plus password update and recovery entry points", async () => {
  const security = await source("../app/minha-conta/seguranca/page.tsx")
  const passwordForm = await source("../components/account/password-update-form.tsx")

  assert.match(security, /identity\.email/)
  assert.match(passwordForm, /\/api\/account\/password/)
  assert.match(security, /esqueci-a-senha/)
})

test("protected customer UI contains no forbidden order internals or admin boundary imports", async () => {
  const paths = [
    "../app/minha-conta/page.tsx",
    "../app/minha-conta/pedidos/page.tsx",
    "../app/minha-conta/pedidos/[id]/page.tsx",
    "../app/minha-conta/perfil/page.tsx",
    "../app/minha-conta/seguranca/page.tsx",
    "../components/account/profile-form.tsx",
    "../components/account/password-update-form.tsx",
  ]
  const combined = (await Promise.all(paths.map(source))).join("\n")

  for (const forbidden of [
    "public_token",
    "payment_id",
    "payment_external_reference",
    "checkout_attempt_id",
    "shipping_quote_token",
    "notification_url",
    "service_role",
    "ADMIN_USER_ID",
  ]) {
    assert.doesNotMatch(combined, new RegExp(forbidden, "i"))
  }
})
