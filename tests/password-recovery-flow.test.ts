import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { sanitizeAccountNext } from "../lib/server/customer-account-actions.ts"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("password recovery uses one dedicated reset destination with no open redirect surface", async () => {
  const resetRoute = await source("../app/api/account/password-reset/route.ts")

  assert.match(resetRoute, /\/redefinir-senha/)
  assert.doesNotMatch(resetRoute, /\/minha-conta\/seguranca\?recovery=1/)

  assert.equal(sanitizeAccountNext("/redefinir-senha"), "/redefinir-senha")
  assert.equal(sanitizeAccountNext("/redefinir-senha?next=https://evil.example"), "/minha-conta")
  assert.equal(sanitizeAccountNext("//evil.example/redefinir-senha"), "/minha-conta")
})

test("recovery callback bypasses profile setup and lands on a standalone authenticated reset page", async () => {
  const callback = await source("../app/auth/callback/route.ts")
  const page = await source("../app/redefinir-senha/page.tsx")
  const proxy = await source("../proxy.ts")

  const recoveryBranch = callback.indexOf('next === "/redefinir-senha"')
  const profileParsing = callback.indexOf("profile = parseAccountProfileMetadata")
  assert.ok(recoveryBranch >= 0, "callback must recognize the dedicated recovery destination")
  assert.ok(profileParsing > recoveryBranch, "recovery must not depend on customer profile metadata")

  assert.match(callback, /resolvePublicSiteUrl/)
  assert.match(page, /requireCustomerPageAccess\s*\(/)
  assert.match(page, /PasswordForm[^>]*recovery/)
  assert.doesNotMatch(page, /ensureOwnCustomerProfile|customer-profiles/)
  assert.match(proxy, /["']\/redefinir-senha["']/)
})

test("callback redirect response remains mutable before adding cache headers", async () => {
  const callback = await source("../app/auth/callback/route.ts")

  assert.doesNotMatch(callback, /\bResponse\.redirect\s*\(/)
  assert.match(callback, /\bNextResponse\.redirect\s*\(/)
  assert.match(
    callback,
    /response\.headers\.set\(\s*["']Cache-Control["']\s*,\s*["']private, no-store["']\s*\)/,
  )
})

test("recovery password update is same-origin, authenticated, rate-limited, no-store and revokes all refresh sessions", async () => {
  const route = await source("../app/api/account/password-recovery/route.ts")
  const form = await source("../components/account/password-form.tsx")
  const rateLimit = await source("../lib/server/rate-limit.ts")

  assert.match(route, /isSameOriginAccountRequest/)
  assert.match(route, /consumeRateLimit/)
  assert.match(route, /account-password-recovery/)
  assert.match(route, /parseAccountPasswordUpdateInput/)
  assert.match(route, /readJsonBody\s*\(\s*request\s*,\s*4_096\s*\)/)
  assert.match(route, /auth\.getUser\s*\(/)
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
