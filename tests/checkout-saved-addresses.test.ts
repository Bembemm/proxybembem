import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  resolveCheckoutAddressPrefill,
  type CheckoutData,
  type CheckoutSavedAddress,
} from "../lib/checkout.ts"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

const emptyCheckout: CheckoutData = {
  nome: "",
  email: "",
  whatsapp: "",
  cpf: "",
  cep: "",
  rua: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
}

const defaultAddress: CheckoutSavedAddress = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  label: "Casa",
  cep: "86000000",
  street: "Rua Salva",
  number: "10",
  complement: "",
  neighborhood: "Centro",
  city: "Londrina",
  state: "PR",
  isDefault: true,
}

test("checkout prefill never mixes a cart CEP with a different saved address", () => {
  assert.deepEqual(
    resolveCheckoutAddressPrefill(emptyCheckout, defaultAddress, "87000-000"),
    {
      ...emptyCheckout,
      cep: "87000-000",
    },
  )
})

test("checkout prefill can use the full default address when the preview CEP agrees", () => {
  assert.deepEqual(
    resolveCheckoutAddressPrefill(emptyCheckout, defaultAddress, "86000-000"),
    {
      ...emptyCheckout,
      cep: "86000-000",
      rua: "Rua Salva",
      numero: "10",
      complemento: "",
      bairro: "Centro",
      cidade: "Londrina",
      uf: "PR",
    },
  )
})

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
  assert.ok(defaultApply >= 0)

  assert.match(checkout, /savedAddresses/)
  assert.match(checkout, /defaultSavedAddress/)
  assert.match(checkout, /resolveCheckoutAddressPrefill/)
  assert.match(checkout, /handleSavedAddressSelect/)
  assert.match(checkout, /<CheckoutForm[^>]*savedAddresses/)
  assert.match(checkout, /customer:\s*checkout/)
  assert.doesNotMatch(checkout, /customer:\s*\{[^}]*addressId/)
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
