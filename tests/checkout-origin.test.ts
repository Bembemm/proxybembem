import assert from "node:assert/strict"
import test from "node:test"
import { isAllowedCheckoutOrigin, resolvePublicSiteUrl } from "../lib/server/env.ts"

const configured = "https://www.proxybembem.com.br"
const preview = "https://proxybembem-cm4fqr1of-team.vercel.app"

test("production accepts only the configured canonical HTTPS origin", () => {
  const base = {
    configuredSiteUrl: configured,
    requestOrigin: preview,
    nodeEnv: "production",
    vercelEnv: "production",
  }

  assert.equal(isAllowedCheckoutOrigin({ ...base, originHeader: configured }), true)
  assert.equal(isAllowedCheckoutOrigin({ ...base, originHeader: null }), false)
  assert.equal(isAllowedCheckoutOrigin({ ...base, originHeader: preview }), false)
  assert.equal(isAllowedCheckoutOrigin({ ...base, originHeader: "https://evil.example" }), false)
})

test("preview accepts configured or current deployment origin but rejects third parties", () => {
  const base = {
    configuredSiteUrl: configured,
    requestOrigin: preview,
    nodeEnv: "production",
    vercelEnv: "preview",
  }

  assert.equal(isAllowedCheckoutOrigin({ ...base, originHeader: preview }), true)
  assert.equal(isAllowedCheckoutOrigin({ ...base, originHeader: configured }), true)
  assert.equal(isAllowedCheckoutOrigin({ ...base, originHeader: "https://evil.example" }), false)
  assert.equal(isAllowedCheckoutOrigin({ ...base, originHeader: "not a url" }), false)
})

test("production public site URL cannot silently fall back to request origin", () => {
  const env = process.env as Record<string, string | undefined>
  const previousSite = env.NEXT_PUBLIC_SITE_URL
  const previousVercel = env.VERCEL_ENV
  const previousNode = env.NODE_ENV

  delete env.NEXT_PUBLIC_SITE_URL
  env.VERCEL_ENV = "production"
  env.NODE_ENV = "production"

  try {
    assert.throws(() => resolvePublicSiteUrl(preview), /NEXT_PUBLIC_SITE_URL/)
  } finally {
    if (previousSite === undefined) delete env.NEXT_PUBLIC_SITE_URL
    else env.NEXT_PUBLIC_SITE_URL = previousSite
    if (previousVercel === undefined) delete env.VERCEL_ENV
    else env.VERCEL_ENV = previousVercel
    if (previousNode === undefined) delete env.NODE_ENV
    else env.NODE_ENV = previousNode
  }
})
