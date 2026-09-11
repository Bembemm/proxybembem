import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("recovery confirmation suppresses referrer propagation from the credential URL", async () => {
  const source = await readFile(
    new URL("../app/auth/confirm/route.ts", import.meta.url),
    "utf8",
  )

  assert.match(
    source,
    /headers\.set\(\s*["']Referrer-Policy["']\s*,\s*["']no-referrer["']\s*\)/,
  )
})
