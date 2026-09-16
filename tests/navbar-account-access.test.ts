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

test("navbar uses one aligned storefront grid with desktop navigation and a category-free mobile menu", () => {
  const navbar = source("components/navbar.tsx")

  assert.match(navbar, /sticky[^"']*top-0/)
  assert.match(navbar, /max-w-\[1180px\]/)
  assert.match(navbar, /h-16[^"']*lg:h-\[72px\]/)
  assert.match(navbar, /lg:hidden/)
  assert.match(navbar, /hidden[^"']*lg:block/)
  assert.match(navbar, /h-11/)

  assert.match(navbar, />\s*Contato\s*</)
  assert.match(navbar, />\s*Categorias\s*</)
  assert.match(navbar, />\s*Início\s*</)
  assert.match(navbar, />\s*Produtos\s*</)
  assert.match(navbar, /id=["']store-category-menu["']/)

  const mobileStart = navbar.indexOf('id="mobile-store-menu"')
  assert.notEqual(mobileStart, -1)
  const mobileEnd = navbar.indexOf("</nav>", mobileStart)
  assert.notEqual(mobileEnd, -1)
  const mobileMenu = navbar.slice(mobileStart, mobileEnd)
  assert.doesNotMatch(mobileMenu, /Categorias/)
  assert.match(mobileMenu, />\s*Início\s*</)
  assert.match(mobileMenu, />\s*Produtos\s*</)
  assert.match(mobileMenu, />\s*Contato\s*</)

  assert.match(navbar, /UserRound/)
  assert.match(navbar, /ShoppingCart/)
  assert.match(navbar, /useCart/)
  assert.match(navbar, /setIsCartOpen\(true\)/)
  assert.match(navbar, /totalItems/)
  assert.match(navbar, /aria-label=["']Abrir carrinho["']/)

  assert.doesNotMatch(navbar, /placeholder=.*busc/i)
  assert.doesNotMatch(navbar, /Lançamentos/)
})
