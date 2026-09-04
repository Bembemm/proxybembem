import assert from "node:assert/strict"
import test from "node:test"

import { isSameOriginAccountRequest } from "../lib/server/customer-account-actions.ts"

test("production account origin accepts canonical public origin behind an internal reverse-proxy URL", () => {
  const env = process.env as Record<string, string | undefined>
  const previousNodeEnv = env.NODE_ENV
  const previousSiteUrl = env.NEXT_PUBLIC_SITE_URL

  env.NODE_ENV = "production"
  env.NEXT_PUBLIC_SITE_URL = "https://www.proxybembem.com.br"

  try {
    const request = new Request("http://127.0.0.1:21170/api/account/signup", {
      headers: { Origin: "https://www.proxybembem.com.br" },
    })

    assert.equal(isSameOriginAccountRequest(request), true)
  } finally {
    if (previousNodeEnv === undefined) delete env.NODE_ENV
    else env.NODE_ENV = previousNodeEnv

    if (previousSiteUrl === undefined) delete env.NEXT_PUBLIC_SITE_URL
    else env.NEXT_PUBLIC_SITE_URL = previousSiteUrl
  }
})
