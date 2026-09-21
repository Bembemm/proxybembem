import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("Vercel production uses the native Next.js build command", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> }

  assert.equal(packageJson.scripts?.build, "next build")
  assert.equal(packageJson.scripts?.["build:kinghost"], undefined)
  assert.equal(packageJson.scripts?.["deploy:kinghost"], undefined)
})
