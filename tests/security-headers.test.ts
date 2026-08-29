import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const CONFIG = new URL("../next.config.mjs", import.meta.url)

test("Next config defines the required security headers and a restrictive CSP", async () => {
  const source = await readFile(CONFIG, "utf8")

  assert.match(source, /Content-Security-Policy/)
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

  assert.match(source, /default-src 'self'/)
  assert.match(source, /frame-ancestors 'none'/)
  assert.match(source, /object-src 'none'/)
  assert.doesNotMatch(source, /unsafe-eval/)
  assert.doesNotMatch(source, /script-src[^;]*\*/)
})

test("HSTS is conditionally enabled only for the production deployment", async () => {
  const source = await readFile(CONFIG, "utf8")
  assert.match(source, /VERCEL_ENV/)
  assert.match(source, /production/)
  assert.match(source, /max-age=31536000; includeSubDomains/)
})
