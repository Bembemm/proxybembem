import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const layout = new URL("../app/layout.tsx", import.meta.url)
const config = new URL("../next.config.mjs", import.meta.url)

test("runtime no longer emits Vercel Analytics client integration", async () => {
  const [layoutSource, configSource] = await Promise.all([
    readFile(layout, "utf8"),
    readFile(config, "utf8"),
  ])

  assert.doesNotMatch(layoutSource, /@vercel\/analytics/)
  assert.doesNotMatch(layoutSource, /<Analytics\s*\/>/)
  assert.doesNotMatch(configSource, /va\.vercel-scripts\.com/)
  assert.doesNotMatch(configSource, /vitals\.vercel-insights\.com/)
})
