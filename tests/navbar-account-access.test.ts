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

test("navbar uses the approved desktop and mobile storefront navigation", () => {
  const navbar = source("components/navbar.tsx")

  assert.match(navbar, /sticky[^"']*top-0/)
  assert.match(navbar, /max-w-\[1180px\]/)
  assert.match(navbar, /h-16[^"']*lg:h-\[72px\]/)
  assert.match(navbar, /lg:hidden/)

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
  assert.doesNotMatch(navbar, /Lançamentos/)
})

test("navbar provides the approved shared search panel with live product suggestions", () => {
  const navbar = source("components/navbar.tsx")

  assert.match(navbar, /\bSearch\b/)
  assert.match(navbar, /isSearchOpen/)
  assert.match(navbar, /setIsSearchOpen/)
  assert.match(navbar, /action=["']\/produtos["']/)
  assert.match(navbar, /method=["']get["']/i)
  assert.match(navbar, /name=["']busca["']/)
  assert.match(navbar, /placeholder=["']Buscar produtos\.\.\.["']/)
  assert.match(navbar, /aria-label=["']Buscar produtos["']/)
  assert.match(navbar, /id=["']store-search["']/)
  assert.match(navbar, /Produtos sugeridos/)
  assert.match(navbar, /Ver todos os resultados/)
  assert.match(navbar, /productHref\(product\)/)
})
