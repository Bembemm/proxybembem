import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("checkout server page supplies saved addresses only for an authenticated customer", async () => {
  const page = await source("../app/checkout/page.tsx")

  assert.match(page, /getOptionalCustomerIdentity/)
  assert.match(page, /listOwnCustomerAddresses/)
  assert.match(page, /savedAddresses/)
  assert.match(page, /CheckoutPage/)
})

test("checkout draft takes precedence over default saved address", async () => {
  const checkout = await source("../components/checkout-page.tsx")

  const draftRead = checkout.indexOf("readCheckoutLoginDraft")
  const defaultApply = checkout.indexOf("defaultSavedAddress")
  assert.ok(draftRead >= 0)
  assert.ok(defaultApply > draftRead)

  assert.match(checkout, /savedAddresses/)
  assert.match(checkout, /defaultSavedAddress/)
  assert.match(checkout, /applySavedAddress/)
  assert.match(checkout, /<CheckoutForm[^>]*savedAddresses/s)
  assert.match(checkout, /customer:\s*checkout/)
  assert.doesNotMatch(checkout, /customer:\s*\{[^}]*addressId/s)
})

test("checkout form exposes a saved address selector without replacing editable fields", async () => {
  const form = await source("../components/checkout-form.tsx")

  assert.match(form, /savedAddresses/)
  assert.match(form, /Endereços salvos/)
  assert.match(form, /onSelectSavedAddress/)
  assert.match(form, /checkout-cep/)
  assert.match(form, /checkout-rua/)
  assert.match(form, /checkout-numero/)
})
