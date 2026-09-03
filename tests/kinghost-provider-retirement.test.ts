import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import test from "node:test"

const ACTIVE_RUNTIME_FILES = [
  "next.config.mjs",
  "lib/server/env.ts",
  "lib/server/rate-limit.ts",
  "lib/server/shipping-quote.ts",
  "app/api/shipping/quote/route.ts",
  "app/api/checkout/route.ts",
  "app/api/admin/logout/route.ts",
  "app/api/admin/session/activate/route.ts",
  "lib/server/melhor-envio-oauth-start.ts",
] as const

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8")
}

test("active runtime is KingHost-only and contains no Vercel environment or proxy contracts", async () => {
  for (const relativePath of ACTIVE_RUNTIME_FILES) {
    const text = await source(relativePath)
    assert.doesNotMatch(text, /VERCEL_ENV/, `${relativePath} still references VERCEL_ENV`)
    assert.doesNotMatch(
      text,
      /x-vercel-/i,
      `${relativePath} still references a Vercel proxy header`,
    )
  }
})

test("Vercel deployment configuration is retired", async () => {
  await assert.rejects(access(new URL("../vercel.json", import.meta.url)))
})
