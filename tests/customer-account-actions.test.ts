import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

async function accountActions() {
  return import("../lib/server/customer-account-actions.ts")
}

test("signup input is exact bounded normalized customer data", async () => {
  const actions = await accountActions()
  const input = actions.parseAccountSignupInput({
    name: "  Cliente   Teste  ",
    email: " Cliente+Deck@Example.COM ",
    whatsapp: "(44) 99999-9999",
    password: "senha-segura-123",
  })

  assert.deepEqual(input, {
    name: "Cliente Teste",
    email: "cliente+deck@example.com",
    whatsapp: "44999999999",
    password: "senha-segura-123",
  })

  for (const invalid of [
    { name: "ab", email: "cliente@example.com", whatsapp: "44999999999", password: "12345678" },
    { name: "Cliente Teste", email: "invalido", whatsapp: "44999999999", password: "12345678" },
    { name: "Cliente Teste", email: "cliente@example.com", whatsapp: "123", password: "12345678" },
    { name: "Cliente Teste", email: "cliente@example.com", whatsapp: "44999999999", password: "1234567" },
    { name: "Cliente Teste", email: "cliente@example.com", whatsapp: "44999999999", password: "x".repeat(129) },
    {
      name: "Cliente Teste",
      email: "cliente@example.com",
      whatsapp: "44999999999",
      password: "senha-segura-123",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
  ]) {
    assert.throws(() => actions.parseAccountSignupInput(invalid))
  }
})

test("login reset and password-update inputs accept only exact bounded credentials", async () => {
  const actions = await accountActions()

  assert.deepEqual(
    actions.parseAccountLoginInput({
      email: " CLIENTE@EXAMPLE.COM ",
      password: "senha-segura-123",
    }),
    { email: "cliente@example.com", password: "senha-segura-123" },
  )
  assert.equal(
    actions.parseAccountResetInput({ email: " CLIENTE@EXAMPLE.COM " }).email,
    "cliente@example.com",
  )
  assert.deepEqual(
    actions.parseAccountPasswordUpdateInput({ password: "nova-senha-123" }),
    { password: "nova-senha-123" },
  )

  assert.throws(() => actions.parseAccountLoginInput({ email: "x", password: "12345678" }))
  assert.throws(() => actions.parseAccountResetInput({ email: "x" }))
  assert.throws(() => actions.parseAccountPasswordUpdateInput({ password: "curta" }))
  assert.throws(() =>
    actions.parseAccountLoginInput({
      email: "cliente@example.com",
      password: "senha-segura-123",
      customerId: "browser-must-not-control-this",
    }),
  )
  assert.throws(() =>
    actions.parseAccountResetInput({
      email: "cliente@example.com",
      customerId: "browser-must-not-control-this",
    }),
  )
  assert.throws(() =>
    actions.parseAccountPasswordUpdateInput({
      password: "nova-senha-123",
      userId: "browser-must-not-control-this",
    }),
  )
})

test("mutating account requests require an exact same-origin Origin header", async () => {
  const actions = await accountActions()
  const url = "https://www.proxybembem.com.br/api/account/login"

  assert.equal(
    actions.isSameOriginAccountRequest(
      new Request(url, { headers: { Origin: "https://www.proxybembem.com.br" } }),
    ),
    true,
  )
  assert.equal(actions.isSameOriginAccountRequest(new Request(url)), false)
  assert.equal(
    actions.isSameOriginAccountRequest(
      new Request(url, { headers: { Origin: "https://evil.example" } }),
    ),
    false,
  )
  assert.equal(
    actions.isSameOriginAccountRequest(
      new Request(url, { headers: { Origin: "https://www.proxybembem.com.br.evil.example" } }),
    ),
    false,
  )
})

test("auth callback next destination is restricted to local customer-account routes", async () => {
  const actions = await accountActions()

  assert.equal(actions.sanitizeAccountNext("/minha-conta"), "/minha-conta")
  assert.equal(
    actions.sanitizeAccountNext("/minha-conta/pedidos?pagina=2"),
    "/minha-conta/pedidos?pagina=2",
  )
  assert.equal(
    actions.sanitizeAccountNext("/minha-conta/seguranca?recovery=1"),
    "/minha-conta/seguranca?recovery=1",
  )
  for (const unsafe of [
    "https://evil.example/minha-conta",
    "//evil.example/minha-conta",
    "/admin",
    "/pedido/abc",
    "/minha-conta-evil",
    "javascript:alert(1)",
  ]) {
    assert.equal(actions.sanitizeAccountNext(unsafe), "/minha-conta")
  }
})

test("account rate-limit scopes use the approved independent policies", async () => {
  const rateLimit = await source("../lib/server/rate-limit.ts")

  for (const [scope, limit, seconds] of [
    ["account-signup", 5, 900],
    ["account-login", 10, 600],
    ["account-password-reset", 5, 900],
    ["account-profile", 20, 600],
  ] as const) {
    assert.match(rateLimit, new RegExp(`"${scope}"\\s*:\\s*\\{\\s*limit:\\s*${limit},\\s*windowSeconds:\\s*${seconds}\\s*\\}`))
  }
  assert.doesNotMatch(rateLimit, /account-claim/)
})

test("proxy keeps every existing admin matcher while adding account auth surfaces", async () => {
  const proxy = await source("../proxy.ts")

  for (const existing of [
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/internal/melhor-envio/oauth/start",
  ]) {
    assert.ok(proxy.includes(`"${existing}"`), `missing existing matcher ${existing}`)
  }
  for (const account of [
    "/entrar",
    "/criar-conta",
    "/esqueci-a-senha",
    "/auth/callback",
    "/minha-conta/:path*",
    "/api/account/:path*",
  ]) {
    assert.ok(proxy.includes(`"${account}"`), `missing account matcher ${account}`)
  }
})

test("planned account routes are bounded POST surfaces and callback is GET-only", async () => {
  const jsonRoutes = [
    "../app/api/account/signup/route.ts",
    "../app/api/account/login/route.ts",
    "../app/api/account/password-reset/route.ts",
    "../app/api/account/password/route.ts",
  ]

  for (const path of jsonRoutes) {
    const route = await source(path)
    assert.ok(route.length > 0, `missing ${path}`)
    assert.match(route, /export\s+async\s+function\s+POST|export\s+const\s+POST/)
    assert.doesNotMatch(route, /export\s+(?:async\s+function|const)\s+GET/)
    assert.match(route, /isSameOriginAccountRequest/)
    assert.match(route, /readJsonBody\s*\(\s*request\s*,\s*4_096\s*\)/)
    assert.match(route, /consumeRateLimit/)
    assert.doesNotMatch(route, /console\.(?:log|error)\([^\n]*(?:password|senha)/i)
  }

  const logout = await source("../app/api/account/logout/route.ts")
  assert.ok(logout.length > 0, "missing logout route")
  assert.match(logout, /export\s+async\s+function\s+POST|export\s+const\s+POST/)
  assert.doesNotMatch(logout, /export\s+(?:async\s+function|const)\s+GET/)
  assert.match(logout, /isSameOriginAccountRequest/)
  assert.match(logout, /signOut\s*\(/)
  assert.doesNotMatch(logout, /readJsonBody\s*\(/)

  const callback = await source("../app/auth/callback/route.ts")
  assert.ok(callback.length > 0, "missing auth callback")
  assert.match(callback, /export\s+async\s+function\s+GET|export\s+const\s+GET/)
  assert.doesNotMatch(callback, /export\s+(?:async\s+function|const)\s+POST/)
  assert.match(callback, /verifyOtp/)
  assert.match(callback, /exchangeCodeForSession/)
  assert.match(callback, /sanitizeAccountNext/)
  assert.match(callback, /\/entrar\?confirmado=1/)
})

test("auth routes use the intended Supabase operations without admin-session authorization", async () => {
  const signup = await source("../app/api/account/signup/route.ts")
  const login = await source("../app/api/account/login/route.ts")
  const reset = await source("../app/api/account/password-reset/route.ts")
  const update = await source("../app/api/account/password/route.ts")
  const callback = await source("../app/auth/callback/route.ts")
  const combined = [signup, login, reset, update, callback].join("\n")

  assert.match(signup, /signUp\s*\(/)
  assert.match(signup, /emailRedirectTo/)
  assert.match(signup, /name/)
  assert.match(signup, /whatsapp/)
  assert.match(login, /signInWithPassword\s*\(/)
  assert.match(login, /getUser\s*\(/)
  assert.match(reset, /auth\.admin\.generateLink\s*\(/)
  assert.match(update, /getUser\s*\(/)
  assert.match(update, /updateUser\s*\(/)
  assert.match(callback, /getUser\s*\(/)

  assert.doesNotMatch(
    combined,
    /ADMIN_USER_ID|authorizeAdminAccess|activateCurrentAdminSession|admin_sessions|\/admin\/login/,
  )
})

test("password-reset route keeps account existence private", async () => {
  const route = await source("../app/api/account/password-reset/route.ts")
  assert.match(route, /Se o e-mail estiver cadastrado/i)
  assert.doesNotMatch(route, /usu[aá]rio n[aã]o encontrado|user not found|email.*(?:existe|não existe)/i)
})
