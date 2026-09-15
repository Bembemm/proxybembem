import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("customer login next sanitizer allows products and dedicated checkout as local continuations", async () => {
  const actions = await import("../lib/server/customer-account-actions.ts")

  assert.equal(actions.sanitizeCustomerLoginNext("/produtos"), "/produtos")
  assert.equal(
    actions.sanitizeCustomerLoginNext("/produtos?categoria=decks"),
    "/produtos?categoria=decks",
  )
  assert.equal(actions.sanitizeCustomerLoginNext("/checkout"), "/checkout")

  for (const unsafe of [
    "https://evil.example/checkout",
    "//evil.example/checkout",
    "/admin",
    "javascript:alert(1)",
  ]) {
    assert.equal(actions.sanitizeCustomerLoginNext(unsafe), "/minha-conta")
  }
})

test("dedicated checkout redirects an anonymous payment attempt to login without clearing cart state", async () => {
  const checkout = await source("../components/checkout-page.tsx")
  const cartContext = await source("../contexts/cart-context.tsx")

  assert.ok(checkout.length > 0, "missing dedicated checkout page")
  assert.match(checkout, /result\?\.code\s*===\s*["']authentication_required["']/)
  assert.match(checkout, /window\.location\.assign\(\s*["']\/entrar\?next=%2Fcheckout["']\s*\)/)

  const responseError = checkout.indexOf("if (!response.ok)")
  const authRequired = checkout.indexOf('result?.code === "authentication_required"')
  const genericError = checkout.indexOf("setCheckoutError(", authRequired)
  assert.ok(responseError >= 0 && authRequired > responseError)
  assert.ok(genericError > authRequired, "login redirect must happen before generic checkout error")

  const authBranchEnd = checkout.indexOf("}", authRequired)
  const authBranch = checkout.slice(authRequired, authBranchEnd + 1)
  assert.doesNotMatch(authBranch, /clearCart|removeFromCart|localStorage\.removeItem/)

  assert.match(cartContext, /proxybembem-cart-v1/)
  assert.match(cartContext, /localStorage/)
})

test("checkout login handoff stays on the dedicated checkout route", async () => {
  const checkout = await source("../components/checkout-page.tsx")

  const authRequired = checkout.indexOf('result?.code === "authentication_required"')
  const redirect = checkout.indexOf('window.location.assign("/entrar?next=%2Fcheckout")', authRequired)
  const saveDraft = checkout.indexOf("saveCheckoutLoginDraft(", authRequired)

  assert.ok(authRequired >= 0, "missing authentication-required checkout branch")
  assert.ok(saveDraft > authRequired && saveDraft < redirect, "checkout draft must be saved before login")
  assert.ok(redirect > saveDraft, "missing dedicated checkout login redirect")
})

test("saved checkout draft is restored by the dedicated checkout page", async () => {
  const checkout = await source("../components/checkout-page.tsx")

  assert.match(checkout, /readCheckoutLoginDraft\(window\.sessionStorage\)/)
  assert.match(checkout, /setCheckout\(loginDraft\.checkout\)/)
  assert.match(checkout, /restoredShippingServiceIdRef\.current\s*=\s*loginDraft\.shippingServiceId/)
  assert.doesNotMatch(checkout, /setIsCartOpen\(true\)/)
})

test("login handoff preserves checkout details and chosen freight only for the current tab", async () => {
  const draftSource = await source("../lib/checkout-login-draft.ts")
  assert.ok(draftSource.length > 0, "missing temporary checkout login draft helper")

  const draft = await import("../lib/checkout-login-draft.ts")
  const values = {
    nome: "Breno Teste",
    email: "breno@example.com",
    whatsapp: "(44) 99999-9999",
    cpf: "52998224725",
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

  const checkout = await source("../components/checkout-page.tsx")
  assert.match(checkout, /sessionStorage/)
  assert.match(checkout, /saveCheckoutLoginDraft/)
  assert.match(checkout, /readCheckoutLoginDraft/)
  assert.match(checkout, /restoredShippingServiceIdRef/)
})
