import assert from "node:assert/strict"
import test from "node:test"

import {
  createPasswordRecoveryToken,
  isValidPasswordRecoveryToken,
} from "../lib/server/password-recovery-grant.ts"

test("password recovery uses an application-owned 256-bit Base64URL token", () => {
  const token = createPasswordRecoveryToken()
  assert.equal(token.length, 43)
  assert.equal(isValidPasswordRecoveryToken(token), true)
  assert.equal(isValidPasswordRecoveryToken("a".repeat(42)), false)
  assert.equal(isValidPasswordRecoveryToken("a".repeat(44)), false)
  assert.equal(isValidPasswordRecoveryToken("abc def"), false)
})
