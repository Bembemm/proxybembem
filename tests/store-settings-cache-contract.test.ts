import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source() {
  return readFile(
    new URL("../lib/server/store-settings-cache.ts", import.meta.url),
    "utf8",
  ).catch(() => "")
}

test("public store settings use a five-minute tagged server cache", async () => {
  const text = await source()

  assert.ok(text.length > 0, "missing store settings cache module")
  assert.match(text, /unstable_cache/)
  assert.match(text, /readPublicStoreSettings/)
  assert.match(text, /["']public-store-settings["']/)
  assert.match(text, /revalidate\s*:\s*300/)
  assert.match(text, /tags\s*:\s*\[\s*["']store-settings["']\s*\]/)
  assert.doesNotMatch(text, /getAdminStoreSettings/)
})

test("successful admin updates can expire the public settings tag immediately", async () => {
  const text = await source()

  assert.match(text, /revalidateTag/)
  assert.match(text, /revalidateTag\s*\(\s*["']store-settings["']\s*,\s*\{\s*expire\s*:\s*0\s*\}\s*\)/)
})
