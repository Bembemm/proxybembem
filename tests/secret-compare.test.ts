import assert from "node:assert/strict"
import test from "node:test"

async function loadComparator() {
  const module = (await import("../lib/server/secret-compare.ts")) as Record<string, unknown>
  const candidate = module.timingSafeSecretEqual
  assert.equal(typeof candidate, "function", "timingSafeSecretEqual must exist")
  return candidate as (candidate: string, expected: string) => boolean
}

test("accepts identical high-entropy secrets", async () => {
  const compare = await loadComparator()
  const secret = "a".repeat(64)
  assert.equal(compare(secret, secret), true)
})

test("rejects different secrets of the same length", async () => {
  const compare = await loadComparator()
  assert.equal(compare("a".repeat(64), "b".repeat(64)), false)
})

test("rejects different-length secrets without throwing", async () => {
  const compare = await loadComparator()
  assert.doesNotThrow(() => compare("short", "b".repeat(64)))
  assert.equal(compare("short", "b".repeat(64)), false)
})
