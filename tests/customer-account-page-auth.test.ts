import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const LEAF_PAGES = [
  "../app/minha-conta/page.tsx",
  "../app/minha-conta/pedidos/page.tsx",
  "../app/minha-conta/pedidos/[id]/page.tsx",
  "../app/minha-conta/perfil/page.tsx",
  "../app/minha-conta/seguranca/page.tsx",
] as const

const DATA_READS = [
  ["../app/minha-conta/page.tsx", "getOwnCustomerProfile()"],
  ["../app/minha-conta/pedidos/page.tsx", "listOwnOrders("],
  ["../app/minha-conta/pedidos/[id]/page.tsx", "getOwnOrderById("],
  ["../app/minha-conta/perfil/page.tsx", "getOwnCustomerProfile()"],
] as const

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("every customer account leaf page owns its authentication gate", async () => {
  for (const path of LEAF_PAGES) {
    const page = await source(path)
    assert.match(
      page,
      /await\s+requireCustomerPageAccess\s*\(/,
      `${path} must gate authentication in the page itself`,
    )
  }
})

test("protected customer pages authenticate before customer data reads", async () => {
  for (const [path, protectedRead] of DATA_READS) {
    const page = await source(path)
    const authGate = page.indexOf("await requireCustomerPageAccess(")
    const dataRead = page.indexOf(protectedRead)

    assert.ok(dataRead >= 0, `${path} must contain the protected read`)
    assert.ok(authGate >= 0, `${path} must gate authentication in the page itself`)
    assert.ok(authGate < dataRead, `${path} must authenticate before customer data access`)
  }
})

test("private order detail preserves its exact canonical path through the auth gate", async () => {
  const detail = await source("../app/minha-conta/pedidos/[id]/page.tsx")
  const paramsRead = detail.indexOf("const { id } = await params")
  const authGate = detail.indexOf(
    "await requireCustomerPageAccess(`/minha-conta/pedidos/${id}`)",
  )
  const orderRead = detail.indexOf("getOwnOrderById(id)")

  assert.ok(paramsRead >= 0, "order detail must resolve the route id")
  assert.ok(authGate >= 0, "order detail must preserve the exact private return path")
  assert.ok(paramsRead < authGate, "route id must be resolved before authentication")
  assert.ok(authGate < orderRead, "authentication must still happen before the order read")
})

test("customer account layout is structural and does not intercept leaf return paths", async () => {
  const layout = await source("../app/minha-conta/layout.tsx")

  assert.match(layout, /AccountShell/)
  assert.doesNotMatch(layout, /requireCustomerPageAccess/)
})
