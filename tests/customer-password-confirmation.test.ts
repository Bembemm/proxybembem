import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("signup requires matching password confirmation before calling the account API", async () => {
  const form = await source("../components/account/signup-form.tsx")

  assert.match(form, /htmlFor=["']confirmPassword["']/)
  assert.match(form, /name=["']confirmPassword["']/)
  assert.match(form, /type=["']password["']/)
  assert.match(form, /As senhas não coincidem\./)

  const mismatchGuard = form.indexOf("password !== confirmPassword")
  const request = form.indexOf('fetch("/api/account/signup"')
  assert.ok(mismatchGuard >= 0, "signup must compare password confirmation")
  assert.ok(request > mismatchGuard, "signup must reject a mismatch before fetch")
})

test("password update and recovery require matching confirmation before changing the password", async () => {
  const form = await source("../components/account/password-form.tsx")

  assert.match(form, /htmlFor=["']confirmPassword["']/)
  assert.match(form, /name=["']confirmPassword["']/)
  assert.match(form, /type=["']password["']/)
  assert.match(form, /As senhas não coincidem\./)
  assert.match(form, /auth\.updateUser\s*\(\s*\{\s*password\s*\}\s*\)/)
  assert.match(form, /fetch\(\s*["']\/api\/account\/password["']/)

  const mismatchGuard = form.indexOf("password !== confirmPassword")
  const recoveryUpdate = form.indexOf("supabase.auth.updateUser({ password })")
  const normalUpdate = form.indexOf('fetch("/api/account/password"')
  assert.ok(mismatchGuard >= 0, "password update must compare password confirmation")
  assert.ok(recoveryUpdate > mismatchGuard, "recovery must reject a mismatch before updateUser")
  assert.ok(normalUpdate > mismatchGuard, "account update must reject a mismatch before fetch")

  assert.match(form, /const\s+formElement\s*=\s*event\.currentTarget/)
  assert.match(form, /new\s+FormData\s*\(\s*formElement\s*\)/)
  assert.match(form, /formElement\.reset\s*\(\s*\)/)
  assert.doesNotMatch(form, /event\.currentTarget\.reset\s*\(/)
})
