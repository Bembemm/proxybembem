import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("signup confirmation verifies token hash without returning a Supabase session through the reverse proxy", async () => {
  const callback = await source("../app/auth/callback/route.ts")
  const tokenBranchStart = callback.indexOf("if (canVerifyTokenHash)")
  const tokenBranchEnd = callback.indexOf("if (!code)", tokenBranchStart)
  assert.ok(tokenBranchStart >= 0 && tokenBranchEnd > tokenBranchStart)
  const tokenBranch = callback.slice(tokenBranchStart, tokenBranchEnd)

  assert.match(callback, /searchParams\.get\(["']token_hash["']\)/)
  assert.match(callback, /searchParams\.get\(["']type["']\)/)
  assert.match(tokenBranch, /createSupabaseAuthServerClient/)
  assert.match(tokenBranch, /verifyOtp\s*\(/)
  assert.match(tokenBranch, /token_hash\s*:\s*tokenHash/)
  assert.match(tokenBranch, /type\s*:\s*["']email["']/)
  assert.match(tokenBranch, /\/entrar\?confirmado=1/)

  // The normal signup confirmation path must not attempt to persist the
  // returned Supabase session in response cookies. The old PKCE compatibility
  // branch may still use route response cookies for already-issued emails.
  assert.doesNotMatch(tokenBranch, /applyToResponse|createSupabaseRouteClient/)

  // Keep the legacy PKCE callback temporarily for already-issued emails.
  assert.match(callback, /exchangeCodeForSession\s*\(/)
})

test("signup confirmation success message is one-time and cleans its URL marker", async () => {
  const loginPage = await source("../app/entrar/page.tsx")
  const cleanup = await source("../components/account/login-confirmation-flash-cleanup.tsx")

  assert.match(loginPage, /LoginConfirmationFlashCleanup/)
  assert.match(cleanup, /["']use client["']/)
  assert.match(cleanup, /useEffect\s*\(/)
  assert.match(cleanup, /searchParams\.delete\(["']confirmado["']\)/)
  assert.match(cleanup, /history\.replaceState\s*\(/)
  assert.doesNotMatch(cleanup, /searchParams\.delete\(["']next["']\)/)
})

test("used or expired signup confirmation links get a dedicated customer message", async () => {
  const callback = await source("../app/auth/callback/route.ts")
  const loginPage = await source("../app/entrar/page.tsx")
  const tokenBranchStart = callback.indexOf("if (canVerifyTokenHash)")
  const tokenBranchEnd = callback.indexOf("if (!code)", tokenBranchStart)
  assert.ok(tokenBranchStart >= 0 && tokenBranchEnd > tokenBranchStart)
  const tokenBranch = callback.slice(tokenBranchStart, tokenBranchEnd)

  assert.match(tokenBranch, /\/entrar\?erro=confirmacao/)
  assert.match(loginPage, /params\.erro\s*===\s*["']confirmacao["']/)
  assert.match(
    loginPage,
    /Este link de confirmação já foi utilizado ou expirou\. Se sua conta já estiver confirmada, basta entrar\./,
  )
})

test("signup rejects an already registered email before asking Supabase to create another account", async () => {
  const signupRoute = await source("../app/api/account/signup/route.ts")

  assert.match(signupRoute, /getSupabaseEnv/)
  assert.match(signupRoute, /auth\.admin\.listUsers\s*\(/)
  assert.match(signupRoute, /perPage\s*:\s*1_000/)
  assert.match(signupRoute, /user\.email/)
  assert.match(signupRoute, /input\.email/)
  assert.match(signupRoute, /json\(409/)
  assert.match(
    signupRoute,
    /Este e-mail já está cadastrado\. Entre na sua conta ou redefina sua senha\./,
  )

  const duplicateCheck = signupRoute.indexOf("auth.admin.listUsers")
  const signup = signupRoute.indexOf("auth.signUp")
  assert.ok(duplicateCheck >= 0 && signup > duplicateCheck)
})

test("password signup sends the exact strongly validated password to Supabase", async () => {
  const signupForm = await source("../components/account/signup-form.tsx")
  const signupRoute = await source("../app/api/account/signup/route.ts")
  const actions = await source("../lib/server/customer-account-actions.ts")

  assert.match(signupForm, /const password = String\(form\.get\(["']password["']/)
  assert.match(signupForm, /body:\s*JSON\.stringify\(input\)/)
  assert.match(actions, /password:\s*validateNewPassword\(input\.password\)/)
  assert.match(actions, /validateCustomerPassword/)
  assert.match(signupRoute, /password:\s*input\.password/)
})

test("successful password login persists SSR cookies on a top-level redirect without exposing auth tokens", async () => {
  const loginRoute = await source("../app/api/account/login/route.ts")
  const loginForm = await source("../components/account/login-form.tsx")

  assert.match(loginRoute, /createSupabaseRouteClient/)
  assert.match(loginRoute, /signInWithPassword\s*\(/)
  assert.match(loginRoute, /getUser\s*\(/)
  assert.match(loginRoute, /applyToResponse\s*\(/)
  assert.doesNotMatch(loginRoute, /createSupabaseAuthServerClient/)
  assert.doesNotMatch(loginRoute, /accessToken|refreshToken/)

  assert.match(loginRoute, /NextResponse\.redirect/)
  assert.match(loginRoute, /status|303/)
  assert.match(loginForm, /action=["']\/api\/account\/login["']/)
  assert.match(loginForm, /method=["']post["']/)
  assert.doesNotMatch(loginForm, /auth\.setSession\s*\(/)
  assert.doesNotMatch(loginForm, /accessToken|refreshToken/)
})

test("login page distinguishes bad credentials, rate limits and service failures", async () => {
  const loginPage = await source("../app/entrar/page.tsx")
  const loginForm = await source("../components/account/login-form.tsx")

  assert.match(loginPage, /params\.erro\s*===\s*["']credenciais["']/)
  assert.match(loginPage, /E-mail ou senha incorretos\./)
  assert.match(loginPage, /params\.erro\s*===\s*["']limite["']/)
  assert.match(loginPage, /Muitas tentativas de login/)
  assert.match(loginPage, /params\.erro\s*===\s*["']servico["']/)
  assert.match(loginPage, /Não foi possível entrar agora/)
  assert.doesNotMatch(loginForm, /createSupabaseBrowserClient/)
})