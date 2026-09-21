import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const ENV_EXAMPLE = new URL("../.env.example", import.meta.url)
const VERCEL_DOC = new URL("../docs/deployment/vercel.md", import.meta.url)

test("environment example keeps non-Vercel proxy trust fail-closed by default", async () => {
  const source = await readFile(ENV_EXAMPLE, "utf8")

  assert.match(source, /RATE_LIMIT_TRUSTED_PROXY_HOPS=0/)
  assert.match(source, /proxy/i)
  assert.match(source, /verific/i)
})

test("Vercel runbook documents the platform-managed client IP boundary", async () => {
  const source = await readFile(VERCEL_DOC, "utf8")

  assert.match(source, /x-forwarded-for/i)
  assert.match(source, /VERCEL=1/)
  assert.match(source, /exactly one proxy hop/i)
  assert.match(source, /fail-closed/i)
})
