import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("admin order detail selects and validates customer email without exposing customer id", async () => {
  const repository = await source("../lib/server/admin-orders.ts")

  assert.ok(repository.length > 0, "missing admin order repository")
  assert.match(repository, /customer_email/)
  assert.match(repository, /isNullableString\(value\.customer_email\)/)

  const selectMatch = repository.match(/const ADMIN_ORDER_DETAIL_SELECT = \[([\s\S]*?)\]\.join/)
  assert.ok(selectMatch, "missing admin order detail select")
  const select = selectMatch[1] ?? ""
  assert.match(select, /["']customer_email["']/)
  assert.doesNotMatch(select, /["']customer_id["']/)
})

test("admin order page renders customer email as read-only support information", async () => {
  const page = await source("../app/admin/pedidos/[id]/page.tsx")

  assert.ok(page.length > 0, "missing admin order detail page")
  assert.match(page, /label=["']E-mail["']/)
  assert.match(page, /order\.customer_email/)
  assert.doesNotMatch(page, /name=["']customer_(?:email|id)["']/)
  assert.doesNotMatch(page, /customer_id/)
})
