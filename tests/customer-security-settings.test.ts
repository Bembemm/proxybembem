import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("email change requires new email and current password", async () => {
  const actions = await import("../lib/server/customer-account-actions.ts")
  assert.equal(typeof actions.parseAccountEmailChangeInput, "function")

  const parse = actions.parseAccountEmailChangeInput as (value: unknown) => {
    email: string
    currentPassword: string
  }

  assert.deepEqual(
    parse({ email: " Novo@Example.COM ", currentPassword: "CurrentPassword1!" }),
    { email: "novo@example.com", currentPassword: "CurrentPassword1!" },
  )
  assert.throws(() => parse({ email: "novo@example.com" }))
})

test("email change route verifies the current credential before requesting provider email change", async () => {
  const route = await source("../app/api/account/email/route.ts")
  const limits = await source("../lib/server/rate-limit.ts")

  assert.match(route, /isSameOriginAccountRequest/)
  assert.match(route, /account-email-change/)
  assert.match(route, /requireCustomerPageAccess/)
  assert.match(route, /parseAccountEmailChangeInput/)
  assert.match(route, /createSupabaseAuthServerClient/)
  assert.match(route, /signInWithPassword/)
  assert.match(route, /identity\.email/)
  assert.match(route, /input\.currentPassword/)
  assert.match(route, /auth\.updateUser\s*\(\s*\{\s*email:\s*input\.email/)
  assert.match(route, /private,\s*no-store/i)
  assert.doesNotMatch(route, /orders|customer_email/)

  assert.match(
    limits,
    /"account-email-change"\s*:\s*\{\s*limit:\s*5,\s*windowSeconds:\s*900\s*\}/,
  )
})

test("security page exposes email change, password change and a non-destructive privacy request", async () => {
  const page = await source("../app/minha-conta/seguranca/page.tsx")
  const emailForm = await source("../components/account/email-change-form.tsx")
  const privacy = await source("../components/account/privacy-request-card.tsx")

  assert.match(page, /EmailChangeForm/)
  assert.match(page, /PrivacyRequestCard/)
  assert.match(page, /PasswordForm/)

  assert.match(emailForm, /\/api\/account\/email/)
  assert.match(emailForm, /Novo e-mail/)
  assert.match(emailForm, /Senha atual/)
  assert.match(emailForm, /Alterar e-mail/)

  assert.match(privacy, /Solicitar exclusão da conta/)
  assert.match(privacy, /WhatsApp/)
  assert.match(privacy, /buildWhatsAppOrderUrl/)
  assert.doesNotMatch(privacy, /fetch\s*\(/)
  assert.doesNotMatch(privacy, /auth\.admin\.deleteUser|deleteUser/)
})
