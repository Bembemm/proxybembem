import assert from "node:assert/strict"
import test from "node:test"
import { NextRequest } from "next/server.js"

const ENV_KEYS = ["NEXT_PUBLIC_SITE_URL"] as const

async function withEnv(run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])

  process.env.NEXT_PUBLIC_SITE_URL = "https://public-preview.example"

  try {
    await run()
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test("OAuth callback redirects to the configured public site instead of an internal proxy origin", async () => {
  await withEnv(async () => {
    const { GET } = await import("../app/api/melhor-envio/oauth/callback/route.ts")
    const request = new NextRequest(
      "https://localhost:3000/api/melhor-envio/oauth/callback?error=access_denied",
    )

    const response = await GET(request)

    assert.equal(response.status, 303)
    const location = new URL(response.headers.get("location")!)
    assert.equal(location.origin, "https://public-preview.example")
    assert.equal(location.pathname, "/admin/integrations/melhor-envio")
    assert.equal(location.searchParams.get("status"), "failed")
  })
})
