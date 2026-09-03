import assert from "node:assert/strict"
import test from "node:test"
import { isAllowedCheckoutOrigin, resolvePublicSiteUrl } from "../lib/server/env.ts"

const configured = "https://www.proxybembem.com.br"
const requestDeployment = "https://preview.proxybembem.test"

test("production accepts only the configured canonical HTTPS origin", () => {
  const base = {
    configuredSiteUrl: configured,
    requestOrigin: requestDeployment,
    nodeEnv: "production",
  }

  assert.equal(isAllowedCheckoutOrigin({ ...base, originHeader: configured }), true)
  assert.equal(isAllowedCheckoutOrigin({ ...base, originHeader: null }), false)
  assert.equal(isAllowedCheckoutOrigin({ ...base, originHeader: requestDeployment }), false)
  assert.equal(isAllowedCheckoutOrigin({ ...base, originHeader: "https://evil.example" }), false)
})

test("development accepts configured or current request origin but rejects third parties", () => {
  const base = {
    configuredSiteUrl: configured,
    requestOrigin: requestDeployment,
    nodeEnv: "development",
  }

  assert.equal(isAllowedCheckoutOrigin({ ...base, originHeader: requestDeployment }), true)
  assert.equal(isAllowedCheckoutOrigin({ ...base, originHeader: configured }), true)
  assert.equal(isAllowedCheckoutOrigin({ ...base, originHeader: "https://evil.example" }), false)
  assert.equal(isAllowedCheckoutOrigin({ ...base, originHeader: "not a url" }), false)
})

test("production public site URL cannot silently fall back to request origin", () => {
  const env = process.env as Record<string, string | undefined>
  const previousSite = env.NEXT_PUBLIC_SITE_URL
  const previousNode = env.NODE_ENV

  delete env.NEXT_PUBLIC_SITE_URL
  env.NODE_ENV = "production"

  try {
    assert.throws(() => resolvePublicSiteUrl(requestDeployment), /NEXT_PUBLIC_SITE_URL/)
  } finally {
    if (previousSite === undefined) delete env.NEXT_PUBLIC_SITE_URL
    else env.NEXT_PUBLIC_SITE_URL = previousSite
    if (previousNode === undefined) delete env.NODE_ENV
    else env.NODE_ENV = previousNode
  }
})
