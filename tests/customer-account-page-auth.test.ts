import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const CASES = [
  ["../app/minha-conta/page.tsx", "getOwnCustomerProfile()"],
  ["../app/minha-conta/pedidos/page.tsx", "listOwnOrders("],
  ["../app/minha-conta/pedidos/[id]/page.tsx", "getOwnOrderById("],
  ["../app/minha-conta/perfil/page.tsx", "getOwnCustomerProfile()"],
] as const

test("protected customer pages gate authentication before customer data reads", async () => {
  for (const [path, protectedRead] of CASES) {
    const source = await readFile(new URL(path, import.meta.url), "utf8")
    const authGate = source.indexOf("await requireCustomerPageAccess()")
    const dataRead = source.indexOf(protectedRead)

    assert.ok(dataRead >= 0, `${path} must contain the protected read`)
    assert.ok(authGate >= 0, `${path} must gate authentication in the page itself`)
    assert.ok(authGate < dataRead, `${path} must authenticate before customer data access`)
  }
})
