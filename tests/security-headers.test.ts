import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const CONFIG = new URL("../next.config.mjs", import.meta.url)

test("Next config keeps static security headers but does not define CSP", async () => {
  const source = await readFile(CONFIG, "utf8")

  assert.doesNotMatch(source, /key:\s*["']Content-Security-Policy["']/)
  assert.match(source, /Strict-Transport-Security/)
  assert.match(source, /X-Content-Type-Options/)
  assert.match(source, /nosniff/)
  assert.match(source, /X-Frame-Options/)
  assert.match(source, /DENY/)
  assert.match(source, /Referrer-Policy/)
  assert.match(source, /strict-origin-when-cross-origin/)
  assert.match(source, /Permissions-Policy/)
  assert.match(source, /camera=\(\)/)
  assert.match(source, /microphone=\(\)/)
  assert.match(source, /geolocation=\(\)/)
})

test("HSTS is conditionally enabled only for the production runtime", async () => {
  const source = await readFile(CONFIG, "utf8")
  assert.match(source, /NODE_ENV/)
  assert.match(source, /production/)
  assert.match(source, /max-age=31536000; includeSubDomains/)
})

test("apex host redirects permanently to the canonical www host", async () => {
  const configUrl = new URL(CONFIG)
  configUrl.searchParams.set("test-case", "canonical-host")
  const loaded = (await import(configUrl.href)) as {
    default: {
      redirects?: () => Promise<
        Array<{
          source: string
          destination: string
          permanent: boolean
          has?: Array<{ type: string; value: string }>
        }>
      >
    }
  }

  assert.equal(typeof loaded.default.redirects, "function")
  const redirects = await loaded.default.redirects!()

  assert.deepEqual(redirects, [
    {
      source: "/:path*",
      has: [{ type: "host", value: "proxybembem.com.br" }],
      destination: "https://www.proxybembem.com.br/:path*",
      permanent: true,
    },
  ])
})
