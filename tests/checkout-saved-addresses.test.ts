import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  applyCheckoutSavedAddress,
  checkoutMatchesSavedAddress,
  selectCheckoutSavedAddress,
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

const secondAddress: CheckoutSavedAddress = {
  ...defaultAddress,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  label: "Trabalho",
  cep: "87000000",
  street: "Rua Trabalho",
  number: "20",
  city: "Maringá",
  isDefault: false,
}

test("cart CEP chooses a matching saved address instead of mixing different addresses", () => {
  assert.equal(
    selectCheckoutSavedAddress([defaultAddress, secondAddress], "87000-000")?.id,
    secondAddress.id,
  )
  assert.equal(
    selectCheckoutSavedAddress([defaultAddress, secondAddress], "86000-000")?.id,
    defaultAddress.id,
  )
})

test("checkout can apply and recognize an already-saved delivery address", () => {
  const checkout = applyCheckoutSavedAddress(emptyCheckout, defaultAddress)
  assert.equal(checkoutMatchesSavedAddress(checkout, defaultAddress), true)
  assert.equal(checkoutMatchesSavedAddress(checkout, secondAddress), false)
})

test("checkout server page requires authentication and supplies profile plus saved addresses", async () => {
  const page = await source("../app/checkout/page.tsx")

  assert.match(page, /requireCustomerPageAccess\(["']\/checkout["']\)/)
  assert.match(page, /listOwnCustomerAddresses/)
  assert.match(page, /getOwnCustomerProfile/)
  assert.match(page, /customerPrefill/)
  assert.match(page, /savedAddresses/)
})

test("checkout form selects a saved address or exposes editable fields for a new one", async () => {
  const form = await source("../components/checkout-form.tsx")

  assert.match(form, /selectedSavedAddressId/)
  assert.match(form, /Onde você quer receber\?/)
  assert.match(form, /\+ Usar outro endereço/)
  assert.match(form, /checkout-cep/)
  assert.match(form, /checkout-rua/)
  assert.match(form, /checkout-numero/)
  assert.match(form, /Salvar este endereço para próximas compras/)
})
