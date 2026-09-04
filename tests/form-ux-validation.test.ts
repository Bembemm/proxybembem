import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

function requireSource(value: string, label: string) {
  assert.ok(value.length > 0, `missing ${label}`)
}

test("account WhatsApp fields reuse the bounded Brazilian formatter", async () => {
  const signup = await source("../components/account/signup-form.tsx")
  const profile = await source("../components/account/profile-form.tsx")

  for (const [form, label] of [
    [signup, "signup form"],
    [profile, "profile form"],
  ] as const) {
    requireSource(form, label)
    assert.match(form, /formatWhatsapp/)
    assert.match(form, /maxLength=\{15\}/)
    assert.match(form, /inputMode=["']numeric["']/)
  }
})

test("password fields share an accessible show-hide control across customer and admin login", async () => {
  const passwordInput = await source("../components/ui/password-input.tsx")
  requireSource(passwordInput, "password input")
  assert.match(passwordInput, /EyeOff/)
  assert.match(passwordInput, /Eye/)
  assert.match(passwordInput, /Mostrar senha/)
  assert.match(passwordInput, /Ocultar senha/)
  assert.match(passwordInput, /type=\{[^\n]*["']text["'][^\n]*["']password["']/)
  assert.match(passwordInput, /type=["']button["']/)

  for (const path of [
    "../components/account/signup-form.tsx",
    "../components/account/login-form.tsx",
    "../components/account/password-form.tsx",
    "../app/admin/login/login-form.tsx",
  ]) {
    const form = await source(path)
    requireSource(form, path)
    assert.match(form, /PasswordInput/)
  }
})

test("account forms validate fields explicitly and expose invalid state for red highlighting", async () => {
  const validation = await source("../lib/account-form.ts")
  requireSource(validation, "account form validation")

  for (const expectedMessage of [
    "Informe seu nome.",
    "Informe um e-mail válido.",
    "Informe um WhatsApp válido com DDD.",
    "A senha precisa ter entre 8 e 128 caracteres.",
    "As senhas não coincidem.",
  ]) {
    assert.ok(validation.includes(expectedMessage), `missing clear validation copy: ${expectedMessage}`)
  }

  const forms = [
    await source("../components/account/signup-form.tsx"),
    await source("../components/account/login-form.tsx"),
    await source("../components/account/password-reset-form.tsx"),
    await source("../components/account/profile-form.tsx"),
    await source("../components/account/password-form.tsx"),
  ]
  for (const form of forms) {
    requireSource(form, "account form")
    assert.match(form, /aria-invalid=/)
  }

  const globals = await source("../app/globals.css")
  requireSource(globals, "global styles")
  assert.match(globals, /\[aria-invalid=["']true["']\]/)
  assert.match(globals, /:user-invalid/)
  assert.match(globals, /destructive/)
})

test("password reset checks Supabase email errors instead of reporting a false success", async () => {
  const route = await source("../app/api/account/password-reset/route.ts")
  requireSource(route, "password reset route")

  assert.match(
    route,
    /const\s*\{\s*error\s*\}\s*=\s*await\s+(?:routeClient\.)?supabase\.auth\.resetPasswordForEmail\s*\(/,
  )
  assert.match(route, /if\s*\(\s*error\s*\)/)
  assert.match(route, /error\.status\s*===\s*429/)
  assert.match(route, /Muitas tentativas de envio/)
  assert.match(route, /RESET_MESSAGE/)
})
