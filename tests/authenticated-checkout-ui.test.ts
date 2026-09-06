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

test("login handoff preserves checkout details and chosen freight only for the current tab", async () => {
  const draftSource = await source("../lib/checkout-login-draft.ts")
  assert.ok(draftSource.length > 0, "missing temporary checkout login draft helper")

  // @ts-expect-error RED: implementation intentionally does not exist yet.
  const draft = await import("../lib/checkout-login-draft.ts")
  const values = {
    nome: "Breno Teste",
    email: "breno@example.com",
    whatsapp: "(44) 99999-9999",
    cep: "86730-000",
    rua: "Rua Teste",
    numero: "123",
    complemento: "Apto 4",
    bairro: "Centro",
    cidade: "Astorga",
    uf: "PR",
  }

  const memory = new Map<string, string>()
  const storage = {
    getItem(key: string) {
      return memory.get(key) ?? null
    },
    setItem(key: string, value: string) {
      memory.set(key, value)
    },
    removeItem(key: string) {
      memory.delete(key)
    },
  }

  const savedAt = 1_000_000
  assert.equal(
    draft.saveCheckoutLoginDraft(storage, values, "2", savedAt),
    true,
    "valid checkout state should be saved for the login round-trip",
  )
  assert.deepEqual(draft.readCheckoutLoginDraft(storage, savedAt + 60_000), {
    checkout: values,
    shippingServiceId: "2",
  })
  assert.equal(
    draft.readCheckoutLoginDraft(storage, savedAt + 31 * 60_000),
    null,
    "login draft must expire instead of becoming persistent customer data",
  )

  assert.doesNotMatch(draftSource, /localStorage/)

  const cart = await source("../components/cart-panel.tsx")
  assert.match(cart, /sessionStorage/)
  assert.match(cart, /saveCheckoutLoginDraft/)
  assert.match(cart, /readCheckoutLoginDraft/)
  assert.match(cart, /setIsCartOpen\(true\)/)
  assert.match(cart, /restoredShippingServiceIdRef/)
})
