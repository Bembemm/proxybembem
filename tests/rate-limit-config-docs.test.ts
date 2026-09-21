import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const ENV_EXAMPLE = new URL("../.env.example", import.meta.url)
const VERCEL_DOC = new URL("../docs/deployment/vercel.md", import.meta.url)

test("environment example does not expose a configurable proxy-hop trust setting", async () => {
  const source = await readFile(ENV_EXAMPLE, "utf8")
  const legacySetting = ["RATE_LIMIT", "TRUSTED_PROXY_HOPS"].join("_")

  assert.doesNotMatch(source, new RegExp(legacySetting))
})

test("Vercel runbook documents the platform-managed client IP boundary", async () => {
  const source = await readFile(VERCEL_DOC, "utf8")

  assert.match(source, /x-forwarded-for/i)
  assert.match(source, /VERCEL=1/)
  assert.match(source, /one platform-managed hop/i)
  assert.match(source, /trusts no forwarding hop/i)
})
