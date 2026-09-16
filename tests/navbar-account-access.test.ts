import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

test("navbar exposes account access as an icon for guests and authenticated customers without flashing the wrong state", () => {
  const navbar = source("components/navbar.tsx")

  assert.match(navbar, /createSupabaseBrowserClient/)
  assert.match(navbar, /auth\.getUser\s*\(/)
  assert.match(navbar, /["']loading["']/)
  assert.match(navbar, /["']Entrar["']/)
  assert.match(navbar, /href:\s*["']\/entrar["']/)
  assert.match(navbar, /["']Meu perfil["']/)
  assert.match(navbar, /href:\s*["']\/minha-conta\/perfil["']/)
  assert.match(navbar, /User(?:Round)?/)
  assert.match(navbar, /aria-label=\{accountItem\.label\}/)
})

test("navbar resolves an unauthenticated getUser error to guest instead of staying in loading", () => {
  const navbar = source("components/navbar.tsx")

  assert.doesNotMatch(navbar, /if \(cancelled \|\| error\) return/)
  assert.match(navbar, /if \(cancelled\) return/)
  assert.match(
    navbar,
    /if \(error\) \{\s*setAccountState\(["']guest["']\)\s*return\s*\}/,
  )
})

test("navbar keeps Categorias as the only storefront text navigation and exposes account and cart as icons", () => {
  const navbar = source("components/navbar.tsx")

  assert.match(navbar, />\s*Categorias\s*</)
  assert.doesNotMatch(navbar, /label:\s*["']Início["']/)
  assert.doesNotMatch(navbar, /label:\s*["']Produtos["']/)
  assert.doesNotMatch(navbar, /label:\s*["']Contato["']/)
  assert.match(navbar, /UserRound/)
  assert.match(navbar, /ShoppingCart/)
  assert.match(navbar, /useCart/)
  assert.match(navbar, /setIsCartOpen\(true\)/)
  assert.match(navbar, /totalItems/)
  assert.match(navbar, /aria-label=["']Abrir carrinho["']/)
})
