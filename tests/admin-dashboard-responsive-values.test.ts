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
  assert.match(source, /text-\[clamp\(0\.6875rem,0\.8vw,0\.875rem\)\]/)
  assert.doesNotMatch(source, /2xl:text-lg/)
  assert.match(source, /px-1\.5\s+py-3\s+sm:px-2/)
  assert.match(source, /tabular-nums/)
  assert.match(source, /min-w-0/)
})
