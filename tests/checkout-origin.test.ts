import assert from "node:assert/strict"
import test from "node:test"
import * as envModule from "../lib/server/env.ts"

type CheckoutOriginValidator = (
  originHeader: string | null,
  configuredSiteUrl: string,
  requestOrigin: string,
) => boolean

function checkoutOriginValidator(): CheckoutOriginValidator {
  const candidate = (envModule as unknown as Record<string, unknown>).isAllowedCheckoutOrigin
  assert.equal(typeof candidate, "function", "isAllowedCheckoutOrigin must be exported")
  return candidate as CheckoutOriginValidator
}

test("accepts the current Vercel deployment origin when the configured URL is the stable branch URL", () => {
  const isAllowedCheckoutOrigin = checkoutOriginValidator()

  assert.equal(
    isAllowedCheckoutOrigin(
      "https://proxybembem-cm4fqr1of-team.vercel.app",
      "https://proxybembem-git-feat-checkout-team.vercel.app",
      "https://proxybembem-cm4fqr1of-team.vercel.app",
    ),
    true,
  )
})

test("still rejects an unrelated external origin", () => {
  const isAllowedCheckoutOrigin = checkoutOriginValidator()

  assert.equal(
    isAllowedCheckoutOrigin(
      "https://evil.example",
      "https://proxybembem-git-feat-checkout-team.vercel.app",
      "https://proxybembem-cm4fqr1of-team.vercel.app",
    ),
    false,
  )
})
