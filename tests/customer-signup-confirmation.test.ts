import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("signup confirmation supports server-side token-hash verification without a browser PKCE verifier", async () => {
  const callback = await source("../app/auth/callback/route.ts")

  assert.match(callback, /searchParams\.get\(["']token_hash["']\)/)
  assert.match(callback, /searchParams\.get\(["']type["']\)/)
  assert.match(callback, /verifyOtp\s*\(/)
  assert.match(callback, /token_hash\s*:\s*tokenHash/)
  assert.match(callback, /type\s*:\s*["']email["']/)

  // Keep the legacy PKCE callback temporarily so already-issued confirmation
  // emails can still fail safely instead of becoming an unknown route shape.
  assert.match(callback, /exchangeCodeForSession\s*\(/)
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
