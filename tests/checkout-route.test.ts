import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const ROUTE = new URL("../app/api/checkout/route.ts", import.meta.url)

async function source() {
  return await readFile(ROUTE, "utf8")
}

test("checkout route resolves optional customer identity only on the server", async () => {
  const text = await source()

  assert.match(text, /getOptionalCustomerIdentity/)
  assert.match(text, /await\s+getOptionalCustomerIdentity\s*\(\s*\)/)
  assert.match(text, /executeCheckoutFlow\s*\(\s*\{[\s\S]*customerIdentity[\s\S]*\}/)
})

test("checkout route never accepts a browser-selected customer id", async () => {
  const text = await source()

  assert.doesNotMatch(text, /payload\.customerId|candidate\.customerId|["']customer_id["']/)
  assert.doesNotMatch(text, /customerId\?\s*:\s*unknown/)
})
