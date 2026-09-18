import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("address input is normalized and bounded", async () => {
  const addresses = await import("../lib/server/customer-addresses.ts")
  assert.equal(typeof addresses.normalizeCustomerAddressInput, "function")

  const normalize = addresses.normalizeCustomerAddressInput as (value: unknown) => {
    label: string
    cep: string
    street: string
    number: string
    complement: string
    neighborhood: string
    city: string
    state: string
    isDefault: boolean
  }

  assert.deepEqual(
    normalize({
      label: " Casa ",
      cep: "86000-000",
      street: " Rua Teste ",
      number: " 123 ",
      complement: " Apto 2 ",
      neighborhood: " Centro ",
      city: " Londrina ",
      state: "pr",
      isDefault: true,
    }),
    {
      label: "Casa",
      cep: "86000000",
      street: "Rua Teste",
      number: "123",
      complement: "Apto 2",
      neighborhood: "Centro",
      city: "Londrina",
      state: "PR",
      isDefault: true,
    },
  )

  assert.throws(() => normalize({}))
})

test("address account routes are authenticated, same-origin, bounded and customer-owned", async () => {
  const collection = await source("../app/api/account/addresses/route.ts")
  const item = await source("../app/api/account/addresses/[id]/route.ts")
  const storage = await source("../lib/server/customer-addresses.ts")
  const limits = await source("../lib/server/rate-limit.ts")

  for (const route of [collection, item]) {
    assert.match(route, /isSameOriginAccountRequest/)
    assert.match(route, /requireCustomerPageAccess/)
    assert.match(route, /account-address/)
    assert.match(route, /readJsonBody\s*\(\s*request\s*,\s*8_192\s*\)/)
    assert.match(route, /private,\s*no-store/i)
    assert.doesNotMatch(route, /service_role|supabaseSecretKey/)
  }

  assert.match(storage, /MAX_CUSTOMER_ADDRESSES\s*=\s*5/)
  assert.match(storage, /customer_id/)
  assert.match(storage, /getCurrentUserId/)
  assert.doesNotMatch(storage, /ADMIN_USER_ID/)

  assert.match(
    limits,
    /"account-address"\s*:\s*\{\s*limit:\s*30,\s*windowSeconds:\s*600\s*\}/,
  )
})

test("account UI includes a saved address book", async () => {
  const nav = await source("../components/account/account-nav.tsx")
  const page = await source("../app/minha-conta/enderecos/page.tsx")
  const book = await source("../components/account/address-book.tsx")

  assert.match(nav, /\/minha-conta\/enderecos/)
  assert.match(nav, /Endereços/)
  assert.match(page, /requireCustomerPageAccess/)
  assert.match(page, /listOwnCustomerAddresses/)
  assert.match(page, /AddressBook/)
  assert.match(book, /Adicionar endereço/)
  assert.match(book, /Definir como padrão/)
  assert.match(book, /Excluir/)
})
