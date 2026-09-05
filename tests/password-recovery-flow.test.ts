import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { sanitizeAccountNext } from "../lib/server/customer-account-actions.ts"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("password recovery request no longer depends on the auth callback PKCE redirect", async () => {
  const resetRoute = await source("../app/api/account/password-reset/route.ts")

  assert.match(resetRoute, /resetPasswordForEmail\s*\(\s*input\.email\s*\)/)
  assert.doesNotMatch(resetRoute, /auth\/callback\?next=/)
  assert.doesNotMatch(resetRoute, /redirectTo/)
  assert.doesNotMatch(resetRoute, /Password recovery request diagnostic/)
})

test("recovery email landing stores token hash without consuming it", async () => {
  const confirm = await source("../app/auth/confirm/route.ts")

  assert.match(confirm, /searchParams\.get\(\s*["']token_hash["']\s*\)/)
  assert.match(confirm, /searchParams\.get\(\s*["']type["']\s*\)/)
  assert.match(confirm, /type\s*!==\s*["']recovery["']/)
  assert.doesNotMatch(confirm, /verifyOtp\s*\(/)
  assert.match(confirm, /httpOnly\s*:\s*true/)
  assert.match(confirm, /sameSite\s*:\s*["']lax["']/i)
  assert.match(confirm, /private,\s*no-store/i)
  assert.match(confirm, /\/redefinir-senha/)
})

test("standalone reset page accepts recovery context without requiring ordinary customer auth", async () => {
  const page = await source("../app/redefinir-senha/page.tsx")

  assert.doesNotMatch(page, /requireCustomerPageAccess\s*\(/)
  assert.match(page, /PasswordForm[^>]*recovery/)
  assert.match(page, /RECOVERY_TOKEN_COOKIE|RECOVERY_VERIFIED_COOKIE/)
})

test("recovery token is verified only on final password submit", async () => {
  const route = await source("../app/api/account/password-recovery/route.ts")

  assert.match(
    route,
    /auth\.verifyOtp\s*\(\s*\{\s*token_hash\s*:\s*[^,]+,\s*type\s*:\s*["']recovery["']\s*\}\s*\)/,
  )
  assert.match(route, /RECOVERY_TOKEN_COOKIE/)
  assert.match(route, /RECOVERY_VERIFIED_COOKIE/)
  assert.match(route, /setRecoveryVerifiedCookie/)
  assert.match(route, /clearRecoveryCookies/)
  assert.match(route, /auth\.updateUser\s*\(\s*\{\s*password:/)
  assert.match(route, /auth\.signOut\s*\(\s*\{\s*scope:\s*["']global["']/)
  assert.match(route, /private,\s*no-store/i)
})

test("recovery retry path requires a server-validated session after token consumption", async () => {
  const route = await source("../app/api/account/password-recovery/route.ts")

  assert.match(route, /createSupabaseRouteClient/)
  assert.match(route, /applyToResponse/)
  assert.match(route, /auth\.getUser\s*\(/)
  assert.match(route, /RECOVERY_VERIFIED_COOKIE/)
})

test("recovery implementation never logs recovery credentials", async () => {
  const combined = [
    await source("../app/auth/confirm/route.ts"),
    await source("../app/api/account/password-reset/route.ts"),
    await source("../app/api/account/password-recovery/route.ts"),
  ].join("\n")

  assert.doesNotMatch(
    combined,
    /console\.(?:log|info|warn|error)\([^\n]*(?:token_hash|password|input\.email|access_token|refresh_token|request\.nextUrl)/i,
  )
})

test("auth callback remains a safe non-recovery PKCE surface", async () => {
  const callback = await source("../app/auth/callback/route.ts")
  const routeClient = await source("../lib/supabase/route.ts")

  assert.doesNotMatch(callback, /\bResponse\.redirect\s*\(/)
  assert.match(callback, /\bNextResponse\.redirect\s*\(/)
  assert.match(
    callback,
    /response\.headers\.set\(\s*["']Cache-Control["']\s*,\s*["']private, no-store["']\s*\)/,
  )
  assert.match(callback, /exchangeCodeForSession/)
  assert.match(callback, /sanitizeAccountNext/)
  assert.match(callback, /ensureOwnCustomerProfile/)
  assert.match(
    routeClient,
    /experimental\s*:\s*\{\s*appendPkceFlowIdToRedirects\s*:\s*true\s*\}/,
  )

  assert.equal(sanitizeAccountNext("/minha-conta"), "/minha-conta")
  assert.equal(sanitizeAccountNext("//evil.example/minha-conta"), "/minha-conta")
})

test("recovery password update remains same-origin, rate-limited, bounded and globally revokes sessions", async () => {
  const route = await source("../app/api/account/password-recovery/route.ts")
  const form = await source("../components/account/password-form.tsx")
  const rateLimit = await source("../lib/server/rate-limit.ts")

  assert.match(route, /isSameOriginAccountRequest/)
  assert.match(route, /consumeRateLimit/)
  assert.match(route, /account-password-recovery/)
  assert.match(route, /parseAccountPasswordUpdateInput/)
  assert.match(route, /readJsonBody\s*\(\s*request\s*,\s*4_096\s*\)/)
  assert.match(route, /auth\.verifyOtp\s*\(/)
  assert.match(route, /auth\.updateUser\s*\(\s*\{\s*password:/)
  assert.match(route, /auth\.signOut\s*\(\s*\{\s*scope:\s*["']global["']/)
  assert.match(route, /private,\s*no-store/i)
  assert.match(
    rateLimit,
    /"account-password-recovery"\s*:\s*\{\s*limit:\s*5,\s*windowSeconds:\s*900\s*\}/,
  )

  assert.match(form, /recovery\??:\s*boolean/)
  assert.match(form, /\/api\/account\/password-recovery/)
  assert.match(form, /\/entrar\?senha=alterada/)
})
