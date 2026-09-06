import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const ROUTE = new URL("../app/api/checkout/route.ts", import.meta.url)

async function source() {
  return await readFile(ROUTE, "utf8")
}

test("checkout route rejects missing verified customer before starting checkout", async () => {
  const text = await source()

  assert.match(text, /getOptionalCustomerIdentity/)
  assert.match(text, /const\s+customerIdentity\s*=\s*await\s+getOptionalCustomerIdentity\s*\(\s*\)/)

  const identityLookup = text.indexOf("const customerIdentity = await getOptionalCustomerIdentity()")
  const authRequired = text.indexOf('code: "authentication_required"')
  const checkoutCall = text.indexOf("const result = await executeCheckoutFlow({")

  assert.ok(identityLookup >= 0, "checkout must resolve the trusted customer identity")
  assert.ok(authRequired >= 0, "checkout must expose the authentication_required contract")
  assert.ok(checkoutCall >= 0, "checkout flow call must remain present")
  assert.ok(
    identityLookup < authRequired && authRequired < checkoutCall,
    "anonymous rejection must happen after identity lookup and before executeCheckoutFlow",
  )

  const authBranch = text.slice(identityLookup, checkoutCall)
  assert.match(authBranch, /if\s*\(\s*!customerIdentity\s*\)/)
  assert.match(authBranch, /Entre na sua conta para continuar o pagamento\./)
  assert.match(authBranch, /authentication_required/)
  assert.match(authBranch, /401/)
})

test("checkout responses remain non-cacheable", async () => {
  const text = await source()

  assert.match(text, /function\s+jsonResponse/)
  assert.match(text, /["']Cache-Control["']\s*:\s*["']no-store["']/)
})

test("checkout route never accepts a browser-selected customer id", async () => {
  const text = await source()

  assert.doesNotMatch(text, /payload\.customerId|candidate\.customerId|["']customer_id["']/)
  assert.doesNotMatch(text, /customerId\?\s*:\s*unknown/)
})
