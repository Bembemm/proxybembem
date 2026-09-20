import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  CUSTOMER_PASSWORD_REQUIREMENTS,
  validateCustomerPassword,
} from "../lib/auth/password-policy.ts"
import {
  CustomerPasswordPolicyError,
  parseAccountLoginInput,
  parseAccountPasswordUpdateInput,
  parseAccountSignupInput,
} from "../lib/server/customer-account-actions.ts"

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
  assert.equal(validateCustomerPassword("A1!" + "x".repeat(125)), null)
  assert.equal(validateCustomerPassword("A1!" + "x".repeat(126)), CUSTOMER_PASSWORD_REQUIREMENTS)
})

test("signup and password updates reject weak passwords with a specific policy error", () => {
  for (const password of invalidPasswords) {
    assert.throws(
      () =>
        parseAccountSignupInput({
          name: "Cliente Teste",
          email: "cliente@example.com",
          whatsapp: "44999999999",
          password,
          next: "/minha-conta",
        }),
      CustomerPasswordPolicyError,
    )
    assert.throws(
      () => parseAccountPasswordUpdateInput({ password }),
      CustomerPasswordPolicyError,
    )
  }

  assert.equal(
    parseAccountSignupInput({
      name: "Cliente Teste",
      email: "cliente@example.com",
      whatsapp: "44999999999",
      password: "ProxyBembem9!",
      next: "/minha-conta",
    }).password,
    "ProxyBembem9!",
  )
})

test("login does not apply signup password policy to an existing credential", () => {
  for (const password of ["x", "senhafraca", "1234567"]) {
    assert.equal(
      parseAccountLoginInput({
        email: "cliente@example.com",
        password,
      }).password,
      password,
    )
  }

  assert.throws(() =>
    parseAccountLoginInput({
      email: "cliente@example.com",
      password: "",
    }),
  )
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

test("account mutation routes expose the password requirements without account-specific information", async () => {
  for (const path of [
    "../app/api/account/signup/route.ts",
    "../app/api/account/password/route.ts",
    "../app/api/account/password-recovery/route.ts",
  ]) {
    const route = await readFile(new URL(path, import.meta.url), "utf8")
    assert.match(route, /CustomerPasswordPolicyError/, path)
    assert.match(route, /instanceof CustomerPasswordPolicyError/, path)
  }
})

test("password requirement message is explicit without account-specific information", () => {
  assert.match(CUSTOMER_PASSWORD_REQUIREMENTS, /8/)
  assert.match(CUSTOMER_PASSWORD_REQUIREMENTS, /maiúscula/i)
  assert.match(CUSTOMER_PASSWORD_REQUIREMENTS, /minúscula/i)
  assert.match(CUSTOMER_PASSWORD_REQUIREMENTS, /número/i)
  assert.match(CUSTOMER_PASSWORD_REQUIREMENTS, /símbolo/i)
  assert.doesNotMatch(CUSTOMER_PASSWORD_REQUIREMENTS, /e-mail|conta|cadastrad/i)
})
