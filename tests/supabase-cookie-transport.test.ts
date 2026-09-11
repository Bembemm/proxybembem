import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("all Supabase SSR clients use token-only cookies to keep reverse-proxy auth headers bounded", async () => {
  const files = [
    "../lib/supabase/client.ts",
    "../lib/supabase/server.ts",
    "../lib/supabase/route.ts",
    "../lib/supabase/proxy.ts",
  ]

  for (const path of files) {
    const contents = await source(path)
    assert.match(
      contents,
      /cookies\s*:\s*\{[\s\S]*?encode\s*:\s*["']tokens-only["']/,
      `${path} must keep Supabase auth cookies token-only`,
    )
  }
})
