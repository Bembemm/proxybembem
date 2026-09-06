import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const TOKEN = "a1".repeat(32)

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

async function accountActions() {
  return import("../lib/server/customer-account-actions.ts")
}

function requireSource(value: string, label: string) {
  assert.ok(value.length > 0, `missing ${label}`)
}

test("login next sanitizer allows only account pages and the products checkout continuation", async () => {
  const actions = await accountActions()

  assert.equal(
    actions.sanitizeCustomerLoginNext("/minha-conta/pedidos?pagina=2"),
    "/minha-conta/pedidos?pagina=2",
  )
  assert.equal(
    actions.sanitizeCustomerLoginNext("/produtos?categoria=decks"),
    "/produtos?categoria=decks",
  )

  for (const unsafe of [
    "https://evil.example/minha-conta",
    "//evil.example/minha-conta",
    "/admin",
    "/pedido/abc",
    `/pedido/${TOKEN}`,
    `/pedido/${TOKEN}/extra`,
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
  assert.match(login, /router\.push\(next\)/)

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

  requireSource(form, "signup form")
  requireSource(route, "signup route")

  assert.match(form, /const\s+formElement\s*=\s*event\.currentTarget/)
  assert.match(form, /new\s+FormData\s*\(\s*formElement\s*\)/)
  assert.match(form, /formElement\.reset\s*\(\s*\)/)
  assert.doesNotMatch(form, /event\.currentTarget\.reset\s*\(/)

  assert.match(route, /const\s*\{\s*error\s*\}\s*=\s*await\s+supabase\.auth\.signUp\s*\(/)
  assert.match(route, /if\s*\(\s*error\s*\)/)
})

test("customer account shell stays structural while leaf pages own server protection", async () => {
  const layout = await source("../app/minha-conta/layout.tsx")
  const shell = await source("../components/account/account-shell.tsx")
  const logout = await source("../components/account/logout-form.tsx")

  requireSource(layout, "customer account layout")
  requireSource(shell, "customer account shell")
  requireSource(logout, "customer logout form")

  assert.match(layout, /AccountShell/)
  assert.doesNotMatch(layout, /requireCustomerPageAccess/)
  assert.match(shell, /\/minha-conta["']/)
  assert.match(shell, /\/minha-conta\/pedidos/)
  assert.match(shell, /\/minha-conta\/perfil/)
  assert.match(shell, /\/minha-conta\/seguranca/)
  assert.match(shell, /Visão geral/)
  assert.match(shell, /Pedidos/)
  assert.match(shell, /Perfil/)
  assert.match(shell, /Segurança/)
  assert.match(logout, /\/api\/account\/logout/)
  assert.match(logout, /method:\s*["']POST["']/)

  for (const value of [layout, shell, logout]) {
    assert.doesNotMatch(value, /components\/admin|AdminShell|requireAdminPageAccess|ADMIN_USER_ID/)
  }
})

test("account overview and order pages read only own curated repositories", async () => {
  const overview = await source("../app/minha-conta/page.tsx")
  const list = await source("../app/minha-conta/pedidos/page.tsx")
  const detail = await source("../app/minha-conta/pedidos/[id]/page.tsx")

  requireSource(overview, "customer account overview")
  requireSource(list, "customer order list page")
  requireSource(detail, "customer order detail page")

  assert.match(overview, /getOwnCustomerProfile/)
  assert.match(overview, /listOwnOrders/)
  assert.match(list, /listOwnOrders/)
  assert.match(list, /\/minha-conta\/pedidos\//)
  assert.match(detail, /getOwnOrderById/)
  assert.match(detail, /notFound/)
  assert.match(detail, /buildWhatsAppOrderUrl/)
  assert.match(detail, /Olá, gostaria de falar sobre o pedido/)
  assert.match(detail, /order\.orderNumber/)
  assert.match(detail, /order\.items/)
  assert.match(detail, /order\.timeline/)
  assert.match(detail, /order\.paymentStatus/)
  assert.match(detail, /order\.fulfillmentStatus/)
  assert.match(detail, /order\.address/)
})

test("profile save is an explicit same-origin POST using only own validated profile fields", async () => {
  const actions = await accountActions()
  assert.deepEqual(
    actions.parseAccountProfileInput({
      name: "  Cliente   Teste  ",
      whatsapp: "(44) 99999-9999",
    }),
    { name: "Cliente Teste", whatsapp: "44999999999" },
  )
  assert.throws(() =>
    actions.parseAccountProfileInput({
      name: "Cliente Teste",
      whatsapp: "44999999999",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }),
  )

  const route = await source("../app/api/account/profile/route.ts")
  const page = await source("../app/minha-conta/perfil/page.tsx")
  const form = await source("../components/account/profile-form.tsx")

  requireSource(route, "profile route")
  requireSource(page, "profile page")
  requireSource(form, "profile form")

  assert.match(route, /export\s+async\s+function\s+POST|export\s+const\s+POST/)
  assert.doesNotMatch(route, /export\s+(?:async\s+function|const)\s+GET/)
  assert.match(route, /isSameOriginAccountRequest/)
  assert.match(route, /scope:\s*["']account-profile["']/)
  assert.match(route, /requireCustomerPageAccess/)
  assert.match(route, /readJsonBody\s*\(\s*request\s*,\s*4_096\s*\)/)
  assert.match(route, /parseAccountProfileInput/)
  assert.match(route, /updateOwnCustomerProfile/)
  assert.doesNotMatch(route, /customerId|customer_id/)

  assert.match(page, /getOwnCustomerProfile/)
  assert.match(page, /ProfileForm/)
  assert.match(form, /\/api\/account\/profile/)
  assert.match(form, /htmlFor=["']name["']/)
  assert.match(form, /htmlFor=["']whatsapp["']/)
  assert.match(form, /Salvar/)
})

test("security page exposes read-only email plus password update and recovery entry points", async () => {
  const page = await source("../app/minha-conta/seguranca/page.tsx")
  const form = await source("../components/account/password-form.tsx")

  requireSource(page, "security page")
  requireSource(form, "password form")

  assert.match(page, /requireCustomerPageAccess/)
  assert.match(page, /identity\.email/)
  assert.match(page, /readOnly|somente leitura/i)
  assert.match(page, /\/esqueci-a-senha/)
  assert.match(form, /\/api\/account\/password/)
  assert.match(form, /htmlFor=["']password["']/)
  assert.match(form, /type=["']password["']/)
  assert.doesNotMatch(form, /email|customerId|customer_id/)
})

test("protected customer UI contains no forbidden order internals or admin boundary imports", async () => {
  const paths = [
    "../app/minha-conta/layout.tsx",
    "../app/minha-conta/page.tsx",
    "../app/minha-conta/pedidos/page.tsx",
    "../app/minha-conta/pedidos/[id]/page.tsx",
    "../app/minha-conta/perfil/page.tsx",
    "../app/minha-conta/seguranca/page.tsx",
    "../components/account/account-shell.tsx",
    "../components/account/logout-form.tsx",
    "../components/account/profile-form.tsx",
    "../components/account/password-form.tsx",
  ]
  const combined = (await Promise.all(paths.map(source))).join("\n")

  for (const forbidden of [
    "public_token",
    "checkout_attempt_id",
    "checkout_fingerprint",
    "checkout_url",
    "shipping_snapshot",
    "admin_audit",
    "payment_id",
    "preference_id",
  ]) {
    assert.doesNotMatch(combined, new RegExp(forbidden, "i"))
  }
  assert.doesNotMatch(
    combined,
    /components\/admin|requireAdminPageAccess|ADMIN_USER_ID|admin_sessions/,
  )
})
