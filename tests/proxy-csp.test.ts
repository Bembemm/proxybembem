import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  buildContentSecurityPolicy,
  createCspNonce,
} from "../lib/security/content-security-policy.ts"
import {
  needsPageCsp,
  needsSupabaseSession,
} from "../lib/security/proxy-routing.ts"

const SUPABASE_PROXY = new URL("../lib/supabase/proxy.ts", import.meta.url)

test("creates a fresh base64 nonce for every call", () => {
  const first = createCspNonce()
  const second = createCspNonce()
  assert.notEqual(first, second)
  assert.match(first, /^[A-Za-z0-9+/]+={0,2}$/)
  assert.match(second, /^[A-Za-z0-9+/]+={0,2}$/)
})

test("production CSP requires the nonce and removes script unsafe-inline", () => {
  const csp = buildContentSecurityPolicy({
    nonce: "dGVzdC1ub25jZQ==",
    nodeEnv: "production",
    melhorEnvioEnvironment: "production",
    supabaseBrowserUrl: "https://example.supabase.co",
  })
  assert.match(csp, /script-src 'self' 'nonce-dGVzdC1ub25jZQ==' 'strict-dynamic'/)
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/)
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-eval'/)
  assert.match(csp, /connect-src 'self' https:\/\/example\.supabase\.co/)
  assert.match(csp, /form-action 'self' https:\/\/melhorenvio\.com\.br/)
})

test("development CSP permits unsafe-eval but never script unsafe-inline", () => {
  const csp = buildContentSecurityPolicy({
    nonce: "bm9uY2U=",
    nodeEnv: "development",
    melhorEnvioEnvironment: "sandbox",
    supabaseBrowserUrl: "https://example.supabase.co",
  })
  assert.match(csp, /script-src[^;]*'unsafe-eval'/)
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/)
  assert.match(csp, /form-action 'self' https:\/\/sandbox\.melhorenvio\.com\.br/)
})

test("invalid configured origins fail closed", () => {
  const csp = buildContentSecurityPolicy({
    nonce: "bm9uY2U=",
    nodeEnv: "production",
    melhorEnvioEnvironment: "invalid",
    supabaseBrowserUrl: "http://example.invalid",
  })
  assert.match(csp, /form-action 'self'(?:;|$)/)
  assert.match(csp, /connect-src 'self'(?:;|$)/)
})

test("public pages need CSP without needing Supabase session refresh", () => {
  assert.equal(needsPageCsp("/"), true)
  assert.equal(needsPageCsp("/produtos"), true)
  assert.equal(needsSupabaseSession("/"), false)
  assert.equal(needsSupabaseSession("/produtos"), false)
})

test("existing protected and auth routes keep Supabase session handling", () => {
  for (const pathname of [
    "/admin",
    "/admin/pedidos",
    "/entrar",
    "/criar-conta",
    "/esqueci-a-senha",
    "/redefinir-senha",
    "/auth/callback",
    "/auth/confirm",
    "/minha-conta",
    "/minha-conta/pedidos",
    "/api/account/login",
    "/api/checkout",
    "/api/admin/orders",
    "/api/internal/melhor-envio/oauth/start",
  ]) {
    assert.equal(needsSupabaseSession(pathname), true, pathname)
  }
})

test("static and API resources do not need page CSP", () => {
  for (const pathname of [
    "/_next/static/a.js",
    "/_next/image",
    "/favicon.ico",
    "/api/shipping/quote",
  ]) {
    assert.equal(needsPageCsp(pathname), false, pathname)
  }
})

test("Supabase session refresh preserves upstream security request headers", async () => {
  const source = await readFile(SUPABASE_PROXY, "utf8")

  assert.match(
    source,
    /updateSupabaseSession\(request: NextRequest, requestHeaders\?: Headers\)/,
  )
  assert.match(
    source,
    /request:\s*\{\s*headers:\s*requestHeaders\s*\?\?\s*request\.headers\s*\}/,
  )
  assert.ok(
    (source.match(/nextResponse\(request, requestHeaders\)/g) ?? []).length >= 2,
    "expected both initial and cookie-refresh responses to preserve requestHeaders",
  )
})
