import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { readFile } from "node:fs/promises"
import test from "node:test"

const require = createRequire(import.meta.url)

const { resolveKingHostPort } = require("../app.js") as {
  resolveKingHostPort(env: Record<string, string | undefined>): string
}

test("KingHost runtime accepts the scoped port variable generated for proxybembem/app.js", () => {
  assert.equal(
    resolveKingHostPort({ PORT_PROXYBEMBEM_APP: "21169", PORT: "3000" }),
    "21169",
  )
})

test("KingHost runtime prefers PORT_APP without hard-coding the allocated port", () => {
  assert.equal(resolveKingHostPort({ PORT_APP: "21169", PORT: "3000" }), "21169")
  assert.equal(resolveKingHostPort({ PORT: "4321" }), "4321")
  assert.equal(resolveKingHostPort({}), "3000")
})

test("KingHost runtime rejects invalid ports", () => {
  assert.throws(() => resolveKingHostPort({ PORT_APP: "abc" }), /valid port/i)
  assert.throws(() => resolveKingHostPort({ PORT_APP: "70000" }), /valid port/i)
})

test("Next config emits standalone output", async () => {
  const source = await readFile(new URL("../next.config.mjs", import.meta.url), "utf8")
  assert.match(source, /output:\s*["']standalone["']/)
})
