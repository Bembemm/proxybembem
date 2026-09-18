import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(
  new URL("../components/admin/dashboard-period-card.tsx", import.meta.url),
  "utf8",
)

test("admin dashboard period values stay fully readable instead of truncating currency", () => {
  assert.doesNotMatch(source, /<dd[^>]*className=["'][^"']*truncate/)
  assert.match(source, /whitespace-nowrap/)
  assert.match(source, /text-\[clamp\(/)
  assert.match(source, /tabular-nums/)
  assert.match(source, /min-w-0/)
})
