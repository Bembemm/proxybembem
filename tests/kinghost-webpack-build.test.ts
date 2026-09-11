import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("KingHost build uses webpack for hosts without native Turbopack bindings", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> }

  assert.match(packageJson.scripts?.["build:kinghost"] ?? "", /next build --webpack/)
})
