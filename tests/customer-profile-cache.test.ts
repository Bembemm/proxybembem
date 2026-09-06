import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("profile mutation invalidates account pages and private account nav avoids speculative stale prefetch", async () => {
  const route = await source("../app/api/account/profile/route.ts")
  const shell = await source("../components/account/account-shell.tsx")

  assert.match(route, /from\s+["']next\/cache["']/)
  assert.match(route, /revalidatePath\(\s*["']\/minha-conta["']\s*\)/)
  assert.match(route, /revalidatePath\(\s*["']\/minha-conta\/perfil["']\s*\)/)

  assert.match(shell, /<Link[\s\S]*?prefetch=\{false\}[\s\S]*?href=\{item\.href\}/)
})
