import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

test("navbar exposes Entrar for guests and Meu perfil for authenticated customers without flashing the wrong state", () => {
  const navbar = source("components/navbar.tsx")

  assert.match(navbar, /createSupabaseBrowserClient/)
  assert.match(navbar, /auth\.getUser\s*\(/)
  assert.match(navbar, /["']loading["']/)
  assert.match(navbar, /label:\s*["']Entrar["']/)
  assert.match(navbar, /href:\s*["']\/entrar["']/)
  assert.match(navbar, /label:\s*["']Meu perfil["']/)
  assert.match(navbar, /href:\s*["']\/minha-conta\/perfil["']/)

  const accountItemRenders = navbar.match(/accountItem/g) ?? []
  assert.ok(accountItemRenders.length >= 3, "account link should be shared by desktop and mobile navigation")
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
