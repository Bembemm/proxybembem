import assert from "node:assert/strict"
import test from "node:test"
import {
  buildContentSecurityPolicy,
  createCspNonce,
} from "../lib/security/content-security-policy.ts"

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
