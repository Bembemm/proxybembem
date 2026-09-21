import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const ACTIVE_DEPLOYMENT_FILES = [
  "../package.json",
  "../next.config.mjs",
  "../.github/workflows/ci.yml",
  "../vercel.json",
]

test("active production deployment files contain no KingHost-specific configuration", async () => {
  for (const path of ACTIVE_DEPLOYMENT_FILES) {
    const source = await readFile(new URL(path, import.meta.url), "utf8")
    assert.doesNotMatch(source, /kinghost/i, `${path} still contains KingHost configuration`)
  }
})

test("active production deployment includes Vercel configuration", async () => {
  const source = await readFile(new URL("../vercel.json", import.meta.url), "utf8")
  assert.match(source, /notifications\/process/)
  assert.match(source, /\*\/5 \* \* \* \*/)
})
