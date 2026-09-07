import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { sanitizeAccountNext } from "../lib/server/customer-account-actions.ts"
import {
  RECOVERY_TOKEN_MAX_AGE_SECONDS,
  isValidRecoveryTokenHash,
} from "../lib/server/password-recovery.ts"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("password recovery helper keeps the application token cookie bounded", () => {
  assert.equal(RECOVERY_TOKEN_MAX_AGE_SECONDS, 3600)
  assert.equal(isValidRecoveryTokenHash("a".repeat(43)), true)
  assert.equal(isValidRecoveryTokenHash("A9_-".repeat(10) + "A9_"), true)
  assert.equal(isValidRecoveryTokenHash("a".repeat(42)), false)
  assert.equal(isValidRecoveryTokenHash("a".repeat(44)), false)
  assert.equal(isValidRecoveryTokenHash("abc def"), false)
})

test("recovery request sends an application-owned scanner-safe link", async () => {
  const resetRoute = await source("../app/api/account/password-reset/route.ts")
  const emailSender = await source("../lib/server/recovery-email.ts")
  const envExample = await source("../.env.example")

  assert.match(resetRoute, /auth\.admin\.generateLink\s*\(/)
  assert.match(resetRoute, /type\s*:\s*["']recovery["']/)
  assert.match(resetRoute, /input\.email/)
  assert.match(resetRoute, /data\.user\?\.id|data\.user\.id/)
  assert.match(resetRoute, /createPasswordRecoveryToken/)
  assert.match(resetRoute, /issuePasswordRecoveryGrant/)
  assert.doesNotMatch(resetRoute, /properties\?\.hashed_token|properties\.hashed_token/)
  assert.match(resetRoute, /["']\/auth\/confirm["']/)
  assert.match(resetRoute, /token_hash/)
  assert.match(resetRoute, /sendPasswordRecoveryEmail/)
  assert.doesNotMatch(resetRoute, /resetPasswordForEmail/)

  assert.match(emailSender, /https:\/\/api\.resend\.com\/emails/)
  assert.match(emailSender, /Authorization/)
  assert.match(emailSender, /Bearer/)
  assert.match(emailSender, /RESEND_API_KEY/)
  assert.match(emailSender, /noreply@proxybembem\.com\.br/)
  assert.match(emailSender, /recoveryUrl/)
  assert.match(envExample, /RESEND_API_KEY=/)
})

test("recovery link landing never consumes a credential", async () => {
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

test("reset page stays public but renders the form only for an active recovery grant", async () => {
  const page = await source("../app/redefinir-senha/page.tsx")

  assert.doesNotMatch(page, /requireCustomerPageAccess\s*\(/)
  assert.doesNotMatch(page, /auth\.getClaims\s*\(/)
  assert.match(page, /cookies\s*\(\s*\)/)
  assert.match(page, /RECOVERY_TOKEN_COOKIE/)
  assert.match(page, /isValidPasswordRecoveryToken/)
  assert.match(page, /isPasswordRecoveryGrantActive/)
  assert.match(page, /redirect\s*\(\s*["']\/entrar\?erro=recovery["']\s*\)/)
  assert.match(page, /PasswordForm[^>]*recovery/)

  const activeCheck = page.indexOf("isPasswordRecoveryGrantActive")
  const form = page.indexOf("<PasswordForm recovery")
  assert.ok(activeCheck >= 0 && form > activeCheck)
})

test("used or expired recovery links get a dedicated customer message", async () => {
  const loginPage = await source("../app/entrar/page.tsx")

  assert.match(loginPage, /params\.erro\s*===\s*["']recovery["']/)
  assert.match(
    loginPage,
    /Este link de recuperação já foi utilizado ou expirou\. Solicite um novo link se precisar redefinir a senha novamente\./,
  )
})

test("recovery form submits the new password only to the server", async () => {
  const form = await source("../components/account/password-form.tsx")

  assert.match(form, /const\s+endpoint\s*=\s*recovery/)
  assert.match(form, /["']\/api\/account\/password-recovery["']/)
  assert.match(form, /fetch\(\s*endpoint/)
  assert.match(form, /\/entrar\?senha=alterada/)
  assert.doesNotMatch(form, /createClient/)
  assert.doesNotMatch(form, /PASSWORD_RECOVERY/)
  assert.doesNotMatch(form, /auth\.updateUser\s*\(/)
})

test("final recovery claims a durable grant and performs a server-only admin password update", async () => {
  const route = await source("../app/api/account/password-recovery/route.ts")

  assert.match(route, /claimPasswordRecoveryGrant/)
  assert.match(route, /createPasswordRecoveryAdminClient/)
  assert.match(route, /auth\.admin\.updateUserById\s*\(/)
  assert.match(route, /finishPasswordRecoveryGrant/)
  assert.match(route, /RECOVERY_TOKEN_COOKIE/)
  assert.match(route, /clearRecoveryTokenCookie/)
  assert.match(route, /private,\s*no-store/i)
  assert.doesNotMatch(route, /verifyOtp\s*\(/)
  assert.doesNotMatch(route, /getClaims\s*\(/)
  assert.doesNotMatch(route, /getUser\s*\(/)
  assert.doesNotMatch(route, /auth\.updateUser\s*\(/)
})

test("durable recovery remains same-origin rate-limited and bounded", async () => {
  const route = await source("../app/api/account/password-recovery/route.ts")
  const rateLimit = await source("../lib/server/rate-limit.ts")

  assert.match(route, /isSameOriginAccountRequest/)
  assert.match(route, /consumeRateLimit/)
  assert.match(route, /account-password-recovery/)
  assert.match(route, /parseAccountPasswordUpdateInput/)
  assert.match(route, /readJsonBody\s*\(\s*request\s*,\s*4_096\s*\)/)
  assert.match(route, /status === ["']busy["']/)
  assert.match(route, /json\(409/)
  assert.match(
    rateLimit,
    /"account-password-recovery"\s*:\s*\{\s*limit:\s*5,\s*windowSeconds:\s*900\s*\}/,
  )
})

test("recovery implementation never logs recovery credential values", async () => {
  const combined = [
    await source("../app/auth/confirm/route.ts"),
    await source("../app/api/account/password-reset/route.ts"),
    await source("../app/api/account/password-recovery/route.ts"),
    await source("../components/account/password-form.tsx"),
    await source("../lib/server/recovery-email.ts"),
    await source("../lib/server/password-recovery-grant.ts"),
  ].join("\n")

  assert.doesNotMatch(
    combined,
    /console\.(?:log|info|warn|error)\([^\n]*(?:token_hash|recoveryToken|grantKey|input\.password|input\.email|access_token|refresh_token|recoveryUrl|request\.nextUrl|request\.cookies|RESEND_API_KEY)/i,
  )
})

test("auth callback keeps recovery isolated while supporting signup confirmation and legacy PKCE", async () => {
  const callback = await source("../app/auth/callback/route.ts")
  const routeClient = await source("../lib/supabase/route.ts")

  assert.doesNotMatch(callback, /\bResponse\.redirect\s*\(/)
  assert.match(callback, /\bNextResponse\.redirect\s*\(/)
  assert.match(
    callback,
    /response\.headers\.set\(\s*["']Cache-Control["']\s*,\s*["']private, no-store["']\s*\)/,
  )
  assert.match(callback, /verifyOtp/)
  assert.match(callback, /type:\s*["']email["']/)
  assert.match(callback, /exchangeCodeForSession/)
  assert.match(callback, /sanitizeAccountNext/)
  assert.doesNotMatch(callback, /type:\s*["']recovery["']/)
  assert.match(
    routeClient,
    /experimental\s*:\s*\{\s*appendPkceFlowIdToRedirects\s*:\s*true\s*\}/,
  )

  assert.equal(sanitizeAccountNext("/minha-conta"), "/minha-conta")
  assert.equal(sanitizeAccountNext("//evil.example/minha-conta"), "/minha-conta")
})

test("proxy includes the recovery confirmation route", async () => {
  const proxy = await source("../proxy.ts")
  assert.match(proxy, /["']\/auth\/confirm["']/)
})
