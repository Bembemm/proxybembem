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
const ROOT_PROXY = new URL("../proxy.ts", import.meta.url)

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

test("Supabase session refresh rebuilds current request headers and reapplies security values", async () => {
  const source = await readFile(SUPABASE_PROXY, "utf8")

  assert.match(source, /type\s+RequestSecurityHeaders\s*=\s*\{/)
  assert.match(source, /nonce:\s*string/)
  assert.match(source, /contentSecurityPolicy:\s*string/)
  assert.match(
    source,
    /updateSupabaseSession\(\s*request:\s*NextRequest,\s*security:\s*RequestSecurityHeaders\s*\|\s*null\s*=\s*null/,
  )
  assert.match(source, /function\s+buildUpstreamHeaders\s*\(/)
  assert.match(source, /new\s+Headers\(request\.headers\)/)
  assert.match(source, /headers\.set\(["']x-nonce["'],\s*security\.nonce\)/)
  assert.match(
    source,
    /headers\.set\(\s*["']Content-Security-Policy["'],\s*security\.contentSecurityPolicy\s*\)/,
  )
  assert.ok(
    (source.match(/buildUpstreamHeaders\(request, security\)/g) ?? []).length >= 2,
    "expected initial and cookie-refresh responses to rebuild current request headers",
  )
  assert.doesNotMatch(source, /requestHeaders\?:\s*Headers/)
})

test("root Proxy owns the per-request nonce CSP contract", async () => {
  const source = await readFile(ROOT_PROXY, "utf8")

  assert.match(source, /createCspNonce/)
  assert.match(source, /buildContentSecurityPolicy/)
  assert.match(source, /buildUpstreamHeaders/)
  assert.match(source, /needsPageCsp/)
  assert.match(source, /needsSupabaseSession/)
  assert.match(source, /nonce/)
  assert.match(source, /contentSecurityPolicy/)
  assert.match(source, /updateSupabaseSession\(request, security\)/)
  assert.match(source, /response\.headers\.set\(["']Content-Security-Policy["']/)
})

test("root Proxy matches pages broadly while skipping static assets and prefetches", async () => {
  const source = await readFile(ROOT_PROXY, "utf8")

  assert.match(source, /_next\/static/)
  assert.match(source, /_next\/image/)
  assert.match(source, /next-router-prefetch/)
  assert.match(source, /purpose/)
  assert.match(source, /prefetch/)
  assert.match(source, /["']\/api\/admin\/:path\*["']/)
  assert.match(source, /["']\/api\/account\/:path\*["']/)
  assert.match(source, /["']\/api\/checkout["']/)
  assert.match(source, /["']\/api\/internal\/melhor-envio\/oauth\/start["']/)
})

test("static config yields CSP ownership to Proxy and root layout opts into request context", async () => {
  const nextConfig = await readFile(
    new URL("../next.config.mjs", import.meta.url),
    "utf8",
  )
  assert.doesNotMatch(
    nextConfig,
    /key:\s*["']Content-Security-Policy["']/,
  )

  const layout = await readFile(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  )
  assert.match(layout, /from\s+["']next\/headers["']/)
  assert.match(layout, /await\s+headers\s*\(\s*\)/)
})
