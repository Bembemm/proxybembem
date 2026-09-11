import assert from "node:assert/strict"
import test from "node:test"
import { assertSafeMetadata } from "../lib/server/safe-metadata.ts"

test("accepts bounded non-secret JSON metadata", () => {
  assert.doesNotThrow(() =>
    assertSafeMetadata(
      {
        reason: "payment_approved",
        amount_cents: 11990,
        nested: [{ ok: true }],
      },
      "metadata",
    ),
  )
})

test("rejects nested secret-like keys", () => {
  for (const value of [
    { access_token: "x" },
    { nested: { refreshToken: "x" } },
    { nested: [{ client_secret: "x" }] },
    { checkout_url: "https://example.invalid" },
    { checkoutFingerprint: "abc" },
  ]) {
    assert.throws(
      () => assertSafeMetadata(value, "metadata"),
      /unsafe metadata key/,
    )
  }
})

test("rejects oversized or non-json metadata", () => {
  assert.throws(
    () => assertSafeMetadata({ body: "x".repeat(17_000) }, "metadata"),
    /metadata too large/,
  )
  assert.throws(
    () => assertSafeMetadata({ n: Number.NaN }, "metadata"),
    /non-json metadata value/,
  )
})

test("rejects cycles and excessive nesting", () => {
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  assert.throws(
    () => assertSafeMetadata(cyclic, "metadata"),
    /cyclic metadata/,
  )

  let nested: Record<string, unknown> = {}
  for (let index = 0; index < 10; index += 1) nested = { nested }
  assert.throws(
    () => assertSafeMetadata(nested, "metadata"),
    /metadata too deep/,
  )
})
