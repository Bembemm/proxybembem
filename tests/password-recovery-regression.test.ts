import assert from "node:assert/strict"
import test from "node:test"

import { isValidRecoveryTokenHash } from "../lib/server/password-recovery.ts"

test("password recovery accepts Supabase recovery token hashes without assuming a 64-character minimum", () => {
  assert.equal(isValidRecoveryTokenHash("a".repeat(56)), true)
  assert.equal(isValidRecoveryTokenHash("A9_-".repeat(14)), true)
  assert.equal(isValidRecoveryTokenHash(""), false)
  assert.equal(isValidRecoveryTokenHash("a".repeat(513)), false)
  assert.equal(isValidRecoveryTokenHash("abc def"), false)
})
