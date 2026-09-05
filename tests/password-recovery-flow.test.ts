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

test("recovery callback emits only bounded non-secret PKCE diagnostics", async () => {
  const callback = await source("../app/auth/callback/route.ts")

  assert.match(callback, /function hasPkceCodeVerifierCookie/)
  assert.match(callback, /request\.cookies\s*\.getAll\(\)/)
  assert.match(callback, /-code-verifier/)
  assert.match(callback, /function sanitizeAuthErrorCode/)
  assert.match(callback, /Password recovery callback diagnostic/)
  assert.match(callback, /hasCodeVerifierCookie/)
  assert.match(callback, /exchangeSucceeded/)
  assert.match(callback, /exchangeErrorCode/)
  assert.doesNotMatch(callback, /console\.(?:info|warn|error)\([^\n]*(?:request\.nextUrl|request\.cookies|getAll\(\)|user\.email|access_token|refresh_token)/)
})

test("password recovery carries PKCE and session cookies on the exact returned route responses", async () => {
  const resetRoute = await source("../app/api/account/password-reset/route.ts")
  const callback = await source("../app/auth/callback/route.ts")
  const routeClient = await source("../lib/supabase/route.ts")

  assert.match(routeClient, /createServerClient/)
  assert.match(routeClient, /request\.cookies\.getAll\(\)/)
  assert.match(routeClient, /pendingCookies/)
  assert.match(routeClient, /response\.cookies\.set\s*\(/)
  assert.match(routeClient, /response\.headers\.set\s*\(/)
  assert.match(routeClient, /applyToResponse/)

  assert.match(resetRoute, /createSupabaseRouteClient/)
  assert.match(resetRoute, /applyToResponse\s*\(/)
  assert.match(callback, /createSupabaseRouteClient/)
  assert.match(callback, /applyToResponse\s*\(/)
})

test("password recovery keeps overlapping PKCE flows isolated by flow id", async () => {
  const callback = await source("../app/auth/callback/route.ts")
  const routeClient = await source("../lib/supabase/route.ts")

  assert.match(
    routeClient,
    /experimental\s*:\s*\{\s*appendPkceFlowIdToRedirects\s*:\s*true\s*\}/,
  )
  assert.match(callback, /searchParams\.get\(\s*["']sb_flow_id["']\s*\)/)
  assert.match(callback, /exchangeCodeForSession\(\s*code\s*,\s*flowId\s*\?\s*\{\s*flowId\s*\}\s*:\s*undefined\s*,?\s*\)/)
})

test("password recovery request logs only whether verifier cookies were queued", async () => {
  const resetRoute = await source("../app/api/account/password-reset/route.ts")
  const routeClient = await source("../lib/supabase/route.ts")

  assert.match(routeClient, /getPendingCookieNames/)
  assert.match(resetRoute, /Password recovery request diagnostic/)
  assert.match(resetRoute, /verifierCookieSet/)
  assert.match(resetRoute, /flowScopedVerifierCookieSet/)
  assert.doesNotMatch(
    resetRoute,
    /console\.(?:info|warn|error)\([^\n]*(?:input\.email|request\.cookies|code_verifier|access_token|refresh_token)/,
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
