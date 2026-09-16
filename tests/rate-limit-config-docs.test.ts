import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const ENV_EXAMPLE = new URL("../.env.example", import.meta.url)
const KINGHOST_DOC = new URL("../docs/deployment/kinghost.md", import.meta.url)
const SANDBOX_DOC = new URL(
  "../docs/deployment/kinghost-sandbox.md",
  import.meta.url,
)

test("environment example keeps proxy trust fail-closed by default", async () => {
  const source = await readFile(ENV_EXAMPLE, "utf8")

  assert.match(source, /RATE_LIMIT_TRUSTED_PROXY_HOPS=0/)
  assert.match(source, /proxy/i)
  assert.match(source, /verific/i)
})

test("KingHost production runbook requires observed forwarding evidence before trusting hops", async () => {
  const source = await readFile(KINGHOST_DOC, "utf8")

  assert.match(source, /RATE_LIMIT_TRUSTED_PROXY_HOPS/)
  assert.match(source, /X-Forwarded-For/i)
  assert.match(source, /default[^\n]*`?0`?/i)
  assert.match(source, /verific[^\n]*(cadeia|header|proxy)/i)
  assert.doesNotMatch(source, /RATE_LIMIT_TRUSTED_PROXY_HOPS=1[^\n]*obrigat/i)
})

test("KingHost sandbox runbook keeps proxy trust disabled until its own chain is verified", async () => {
  const source = await readFile(SANDBOX_DOC, "utf8")

  assert.match(source, /RATE_LIMIT_TRUSTED_PROXY_HOPS=0/)
  assert.match(source, /X-Forwarded-For/i)
  assert.match(source, /verific/i)
  assert.match(source, /unknown/i)
})
