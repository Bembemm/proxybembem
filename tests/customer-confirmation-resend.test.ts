import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("signup confirmation resend is same-origin, bounded and rate limited", async () => {
  const route = await source("../app/api/account/confirmation-resend/route.ts")
  const limits = await source("../lib/server/rate-limit.ts")

  assert.match(route, /isSameOriginAccountRequest/)
  assert.match(route, /readJsonBody\s*\(\s*request\s*,\s*4_096\s*\)/)
  assert.match(route, /parseAccountConfirmationResendInput/)
  assert.match(route, /account-confirmation-resend/)
  assert.match(route, /auth\.resend\s*\(/)
  assert.match(route, /type\s*:\s*["']signup["']/)
  assert.match(route, /emailRedirectTo/)
  assert.match(route, /encodeURIComponent\(input\.next\)/)
  assert.match(route, /private,\s*no-store/i)
  assert.doesNotMatch(route, /registeredEmailExists|listUsers/)

  assert.match(
    limits,
    /"account-confirmation-resend"\s*:\s*\{\s*limit:\s*5,\s*windowSeconds:\s*900\s*\}/,
  )
})

test("signup received page lets the customer request another confirmation email", async () => {
  const page = await source("../app/cadastro-recebido/page.tsx")
  const form = await source("../components/account/confirmation-resend-form.tsx")

  assert.match(page, /ConfirmationResendForm/)
  assert.match(page, /sanitizeCustomerLoginNext/)
  assert.match(page, /next=\{next\}/)
  assert.match(form, /\/api\/account\/confirmation-resend/)
  assert.match(form, /JSON\.stringify\(\{ email, next \}\)/)
  assert.match(form, /htmlFor=["']confirmation-email["']/)
  assert.match(form, /Reenviar e-mail de confirmação/)
  assert.match(
    form,
    /Se existir um cadastro pendente para esse e-mail, enviaremos uma nova confirmação\./,
  )
})
