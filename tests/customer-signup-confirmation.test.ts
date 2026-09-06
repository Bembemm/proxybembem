import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("signup confirmation verifies token hash without returning a Supabase session through the reverse proxy", async () => {
  const callback = await source("../app/auth/callback/route.ts")

  assert.match(callback, /searchParams\.get\(["']token_hash["']\)/)
  assert.match(callback, /searchParams\.get\(["']type["']\)/)
  assert.match(callback, /createSupabaseAuthServerClient/)
  assert.match(callback, /verifyOtp\s*\(/)
  assert.match(callback, /token_hash\s*:\s*tokenHash/)
  assert.match(callback, /type\s*:\s*["']email["']/)
  assert.match(callback, /\/entrar\?confirmado=1/)

  // The normal signup confirmation path must not attempt to persist the
  // returned Supabase session in response cookies. KingHost has shown 502s
  // specifically on successful auth responses while ordinary 401 responses
  // pass through normally.
  assert.doesNotMatch(callback, /verifyOtp[\s\S]{0,800}applyToResponse/)

  // Keep the legacy PKCE callback temporarily for already-issued emails.
  assert.match(callback, /exchangeCodeForSession\s*\(/)
})

test("password signup sends the exact validated password to Supabase", async () => {
  const signupForm = await source("../components/account/signup-form.tsx")
  const signupRoute = await source("../app/api/account/signup/route.ts")
  const actions = await source("../lib/server/customer-account-actions.ts")

  assert.match(signupForm, /const password = String\(form\.get\(["']password["']/)
  assert.match(signupForm, /body:\s*JSON\.stringify\(input\)/)
  assert.match(actions, /password:\s*validatePassword\(input\.password\)/)
  assert.match(signupRoute, /password:\s*input\.password/)
})

test("successful password login transports the session in JSON and lets the browser persist it", async () => {
  const loginRoute = await source("../app/api/account/login/route.ts")
  const loginForm = await source("../components/account/login-form.tsx")

  assert.match(loginRoute, /createSupabaseAuthServerClient/)
  assert.match(loginRoute, /signInWithPassword\s*\(/)
  assert.match(loginRoute, /accessToken/)
  assert.match(loginRoute, /refreshToken/)
  assert.doesNotMatch(loginRoute, /createSupabaseServerClient/)

  assert.match(loginForm, /createSupabaseBrowserClient/)
  assert.match(loginForm, /auth\.setSession\s*\(/)
  assert.match(loginForm, /access_token:\s*payload\.accessToken/)
  assert.match(loginForm, /refresh_token:\s*payload\.refreshToken/)
})

test("login UI does not misreport gateway or server failures as bad credentials", async () => {
  const loginForm = await source("../components/account/login-form.tsx")

  assert.match(loginForm, /response\.status\s*===\s*400\s*\|\|\s*response\.status\s*===\s*401/)
  assert.match(loginForm, /Não foi possível entrar agora/)
  assert.doesNotMatch(
    loginForm,
    /typeof payload\?\.message === "string"[\s\S]{0,240}: "E-mail ou senha inválidos\."/,
  )
})
