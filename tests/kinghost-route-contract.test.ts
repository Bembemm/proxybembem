import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("Melhor Envio refresh route exports only Next route contract values", async () => {
  const source = await readFile(
    new URL("../app/api/internal/melhor-envio/refresh/route.ts", import.meta.url),
    "utf8",
  )

  assert.match(source, /export const runtime = ["']nodejs["']/)
  assert.match(source, /export const GET =/)
  assert.doesNotMatch(source, /export function createMelhorEnvioRefreshHandler/)
})
