import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { sanitizeAccountNext } from "../lib/server/customer-account-actions.ts"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("password recovery helper strictly bounds token hashes and accepts only recent signed recovery AMR", async () => {
  const helpers = await import("../lib/server/password-recovery.ts").catch(() => null)
  assert.ok(helpers, "password recovery helper must exist")
  if (!helpers) return

  const {
    RECOVERY_TOKEN_MAX_AGE_SECONDS,
    hasRecentRecoveryAmr,
    isValidRecoveryTokenHash,
  } = helpers

  assert.equal(RECOVERY_TOKEN_MAX_AGE_SECONDS, 3600)
  assert.equal(isValidRecoveryTokenHash("a".repeat(64)), true)
  assert.equal(isValidRecoveryTokenHash("A9_-".repeat(16)), true)
  assert.equal(isValidRecoveryTokenHash("short"), false)
  assert.equal(isValidRecoveryTokenHash("a".repeat(513)), false)
  assert.equal(isValidRecoveryTokenHash("abc def".repeat(10)), false)

  const now = 2_000_000
  assert.equal(
    hasRecentRecoveryAmr(
      { amr: [{ method: "recovery", timestamp: now - 60 }] },
      now,
    ),
    true,
  )
  assert.equal(
    hasRecentRecoveryAmr(
      { amr: [{ method: "password", timestamp: now - 60 }] },
      now,
    ),
    false,
  )
  assert.equal(
    hasRecentRecoveryAmr(
      { amr: [{ method: "recovery", timestamp: now - 3601 }] },
      now,
    ),
    false,
  )
  assert.equal(
    hasRecentRecoveryAmr(
      { amr: [{ method: "recovery", timestamp: now + 301 }] },
      now,
    ),
    false,
  )
  assert.equal(hasRecentRecoveryAmr({ amr: "recovery" }, now), false)
  assert.equal(hasRecentRecoveryAmr(null, now), false)
})

test("free-plan recovery email uses an explicit implicit-flow redirect to the reset page", async () => {
  const resetRoute = await source("../app/api/account/password-reset/route.ts")

  assert.match(resetRoute, /createClient/)
  assert.match(resetRoute, /flowType\s*:\s*["']implicit["']/)
  assert.match(resetRoute, /persistSession\s*:\s*false/)
  assert.match(resetRoute, /detectSessionInUrl\s*:\s*false/)
  assert.match(resetRoute, /resetPasswordForEmail\s*\(\s*input\.email\s*,/)
  assert.match(resetRoute, /redirectTo/)
  assert.match(resetRoute, /["']\/redefinir-senha["']/)
  assert.doesNotMatch(resetRoute, /createSupabaseRouteClient/)
  assert.doesNotMatch(resetRoute, /auth\/callback\?next=/)
  assert.doesNotMatch(resetRoute, /Password recovery request diagnostic/)
})

test("token-hash landing remains a non-consuming fallback", async () => {
  const confirm = await source("../app/auth/confirm/route.ts")

  assert.match(confirm, /searchParams\.get\(\s*["']token_hash["']\s*\)/)
  assert.match(confirm, /searchParams\.get\(\s*["']type["']\s*\)/)
  assert.match(confirm, /type\s*!==\s*["']recovery["']/)
  assert.doesNotMatch(confirm, /verifyOtp\s*\(/)
  assert.match(confirm, /RECOVERY_TOKEN_COOKIE/)
  assert.match(confirm, /httpOnly\s*:\s*true/)
  assert.match(confirm, /sameSite\s*:\s*["']lax["']/i)
  assert.match(confirm, /private,\s*no-store/i)
  assert.match(confirm, /\/redefinir-senha/)
})

test("reset page is public so the browser can consume an implicit recovery fragment", async () => {
  const page = await source("../app/redefinir-senha/page.tsx")

  assert.doesNotMatch(page, /requireCustomerPageAccess\s*\(/)
  assert.doesNotMatch(page, /RECOVERY_TOKEN_COOKIE/)
  assert.doesNotMatch(page, /auth\.getClaims\s*\(/)
  assert.doesNotMatch(page, /redirect\s*\(/)
  assert.match(page, /PasswordForm[^>]*recovery/)
})

test("recovery form consumes the implicit session in the browser and changes password there", async () => {
  const form = await source("../components/account/password-form.tsx")

  assert.match(form, /createClient/)
  assert.match(form, /flowType\s*:\s*["']implicit["']/)
  assert.match(form, /detectSessionInUrl\s*:\s*true/)
  assert.match(form, /onAuthStateChange/)
  assert.match(form, /PASSWORD_RECOVERY/)
  assert.match(form, /auth\.getClaims\s*\(/)
  assert.match(form, /auth\.updateUser\s*\(\s*\{\s*password/)
  assert.match(form, /auth\.signOut\s*\(\s*\{\s*scope:\s*["']global["']/)
  assert.match(form, /\/entrar\?senha=alterada/)
})

test("token-hash recovery fallback verifies only on final password submit", async () => {
  const route = await source("../app/api/account/password-recovery/route.ts")

  assert.match(
    route,
    /auth\.verifyOtp\s*\(\s*\{\s*token_hash\s*:\s*[^,]+,\s*type\s*:\s*["']recovery["']\s*,?\s*\}\s*\)/,
  )
  assert.match(route, /RECOVERY_TOKEN_COOKIE/)
  assert.match(route, /clearRecoveryTokenCookie/)
  assert.match(route, /auth\.updateUser\s*\(\s*\{\s*password:/)
  assert.match(route, /auth\.signOut\s*\(\s*\{\s*scope:\s*["']global["']/)
  assert.match(route, /private,\s*no-store/i)
})

test("recovery retry path requires recent signed recovery AMR after token consumption", async () => {
  const route = await source("../app/api/account/password-recovery/route.ts")

  assert.match(route, /createSupabaseRouteClient/)
  assert.match(route, /applyToResponse/)
  assert.match(route, /auth\.getClaims\s*\(/)
  assert.match(route, /hasRecentRecoveryAmr/)
  assert.doesNotMatch(route, /RECOVERY_VERIFIED_COOKIE|setRecoveryVerifiedCookie/)
})

test("recovery implementation never logs recovery credential values", async () => {
  const combined = [
    await source("../app/auth/confirm/route.ts"),
    await source("../app/api/account/password-reset/route.ts"),
    await source("../app/api/account/password-recovery/route.ts"),
    await source("../components/account/password-form.tsx"),
  ].join("\n")

  assert.doesNotMatch(
    combined,
    /console\.(?:log|info|warn|error)\([^\n]*(?:token_hash|input\.password|input\.email|access_token|refresh_token|request\.nextUrl|request\.cookies)/i,
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

test("token-hash recovery fallback remains same-origin rate-limited and bounded", async () => {
  const route = await source("../app/api/account/password-recovery/route.ts")
  const rateLimit = await source("../lib/server/rate-limit.ts")

  assert.match(route, /isSameOriginAccountRequest/)
  assert.match(route, /consumeRateLimit/)
  assert.match(route, /account-password-recovery/)
  assert.match(route, /parseAccountPasswordUpdateInput/)
  assert.match(route, /readJsonBody\s*\(\s*request\s*,\s*4_096\s*\)/)
  assert.match(route, /auth\.verifyOtp\s*\(/)
  assert.match(route, /auth\.updateUser\s*\(\s*\{\s*password:/)
  assert.match(route, /auth\.signOut\s*\(\s*\{\s*scope:\s*["']global["']/)
  assert.match(
    rateLimit,
    /"account-password-recovery"\s*:\s*\{\s*limit:\s*5,\s*windowSeconds:\s*900\s*\}/,
  )
})

test("proxy includes the token-hash confirmation route", async () => {
  const proxy = await source("../proxy.ts")
  assert.match(proxy, /["']\/auth\/confirm["']/)
})
