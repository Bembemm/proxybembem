import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  CUSTOMER_PASSWORD_REQUIREMENTS,
  validateCustomerPassword,
} from "../lib/auth/password-policy.ts"

const invalidPasswords = [
  "short7!",
  "onlylowercase1!",
  "ONLYUPPERCASE1!",
  "NoDigitsHere!",
  "NoSymbolsHere1",
]

test("customer password policy requires length plus lower upper digit and symbol", () => {
  for (const password of invalidPasswords) {
    assert.equal(validateCustomerPassword(password), CUSTOMER_PASSWORD_REQUIREMENTS, password)
  }
  assert.equal(validateCustomerPassword("ProxyBembem9!"), null)
  assert.equal(validateCustomerPassword("A1!" + "x".repeat(126)), null)
  assert.equal(validateCustomerPassword("A1!" + "x".repeat(127)), CUSTOMER_PASSWORD_REQUIREMENTS)
})

test("client and server validators share the same customer password policy", async () => {
  const client = await readFile(new URL("../lib/account-form.ts", import.meta.url), "utf8")
  const server = await readFile(
    new URL("../lib/server/customer-account-actions.ts", import.meta.url),
    "utf8",
  )

  assert.match(client, /validateCustomerPassword/)
  assert.match(server, /validateCustomerPassword/)
})

test("password requirement message is explicit without account-specific information", () => {
  assert.match(CUSTOMER_PASSWORD_REQUIREMENTS, /8/)
  assert.match(CUSTOMER_PASSWORD_REQUIREMENTS, /maiúscula/i)
  assert.match(CUSTOMER_PASSWORD_REQUIREMENTS, /minúscula/i)
  assert.match(CUSTOMER_PASSWORD_REQUIREMENTS, /número/i)
  assert.match(CUSTOMER_PASSWORD_REQUIREMENTS, /símbolo/i)
  assert.doesNotMatch(CUSTOMER_PASSWORD_REQUIREMENTS, /e-mail|conta|cadastrad/i)
})
