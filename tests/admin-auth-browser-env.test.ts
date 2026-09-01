import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const CONFIG = new URL("../lib/supabase/config.ts", import.meta.url)

test("browser Supabase env uses statically analyzable NEXT_PUBLIC references", async () => {
  const source = await readFile(CONFIG, "utf8")

  assert.match(source, /process\.env\.NEXT_PUBLIC_SUPABASE_URL/)
  assert.match(source, /process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/)
  assert.doesNotMatch(source, /process\.env\s*\[\s*name\s*\]/)
})
