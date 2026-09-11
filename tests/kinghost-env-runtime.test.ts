import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("KingHost runtime loads the project production env before starting standalone Next", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8")
  const envLoad = source.indexOf('loadEnvFile(path.join(__dirname, ".env.production"))')
  const standaloneStart = source.indexOf('require(path.join(__dirname, ".next", "standalone", "server.js"))')

  assert.ok(envLoad >= 0, "app.js must load the project .env.production explicitly")
  assert.ok(standaloneStart >= 0, "app.js must start the standalone Next server")
  assert.ok(envLoad < standaloneStart, "production env must load before standalone changes cwd")
})
