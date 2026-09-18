import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

const publicContentSurfaces = [
  "components/pages/products-page.tsx",
  "components/pages/contact-page.tsx",
  "components/account/account-shell.tsx",
  "app/termos/page.tsx",
  "app/privacidade/page.tsx",
  "app/trocas-e-reembolsos/page.tsx",
  "app/entrar/page.tsx",
  "app/criar-conta/page.tsx",
  "app/esqueci-a-senha/page.tsx",
  "app/redefinir-senha/page.tsx",
  "app/cadastro-recebido/page.tsx",
]

test("public content flows directly into the global FAQ without viewport-height spacers", () => {
  for (const path of publicContentSurfaces) {
    const content = source(path)

    assert.doesNotMatch(
      content,
      /\bmin-h-screen\b|\bmin-h-\[70vh\]\b/,
      `${path} must not reserve a viewport-height block before the global FAQ`,
    )
  }
})

test("global shell still owns the page-height floor while admin and checkout remain independent", () => {
  const siteShellRouter = source("components/site-shell-router.tsx")
  const adminShell = source("components/admin/admin-shell.tsx")
  const checkout = source("components/checkout-page.tsx")

  assert.match(siteShellRouter, /min-h-screen/)
  assert.match(adminShell, /min-h-screen/)
  assert.match(checkout, /min-h-screen/)
})
