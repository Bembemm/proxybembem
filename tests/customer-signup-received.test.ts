import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("successful signup routes to a dedicated check-your-email step", async () => {
  const form = await source("../components/account/signup-form.tsx")
  const page = await source("../app/cadastro-recebido/page.tsx")

  assert.match(form, /useRouter\s*\(/)
  assert.match(form, /router\.push\(\s*["']\/cadastro-recebido["']\s*\)/)

  assert.ok(page.length > 0, "missing /cadastro-recebido page")
  assert.match(page, /Confira seu e-mail/i)
  assert.match(page, /spam|lixo eletr[oô]nico/i)
  assert.match(page, /href=["']\/entrar["']/)
})
