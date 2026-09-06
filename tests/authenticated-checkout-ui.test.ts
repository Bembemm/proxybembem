import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("customer login next sanitizer allows the products page as a local checkout continuation", async () => {
  const actions = await import("../lib/server/customer-account-actions.ts")

  assert.equal(actions.sanitizeCustomerLoginNext("/produtos"), "/produtos")
  assert.equal(
    actions.sanitizeCustomerLoginNext("/produtos?categoria=decks"),
    "/produtos?categoria=decks",
  )

  for (const unsafe of [
    "https://evil.example/produtos",
    "//evil.example/produtos",
    "/admin",
    "/checkout",
    "javascript:alert(1)",
  ]) {
    assert.equal(actions.sanitizeCustomerLoginNext(unsafe), "/minha-conta")
  }
})

test("cart redirects an anonymous payment attempt to login without clearing cart state", async () => {
  const cart = await source("../components/cart-panel.tsx")
  const cartContext = await source("../contexts/cart-context.tsx")

  assert.ok(cart.length > 0, "missing cart panel")
  assert.match(cart, /result\?\.code\s*===\s*["']authentication_required["']/)
  assert.match(cart, /window\.location\.assign\(\s*["']\/entrar\?next=%2Fprodutos["']\s*\)/)

  const responseError = cart.indexOf("if (!response.ok)")
  const authRequired = cart.indexOf('result?.code === "authentication_required"')
  const genericError = cart.indexOf("setCheckoutError(", authRequired)
  assert.ok(responseError >= 0 && authRequired > responseError)
  assert.ok(genericError > authRequired, "login redirect must happen before generic checkout error")

  const authBranchEnd = cart.indexOf("}", authRequired)
  const authBranch = cart.slice(authRequired, authBranchEnd + 1)
  assert.doesNotMatch(authBranch, /clearCart|removeFromCart|localStorage\.removeItem/)

  assert.match(cartContext, /proxybembem-cart-v1/)
  assert.match(cartContext, /localStorage/)
})
