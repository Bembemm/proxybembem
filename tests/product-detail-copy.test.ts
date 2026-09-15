import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const modalSource = readFileSync(
  new URL("../components/product-detail-modal.tsx", import.meta.url),
  "utf8",
)

test("modal renders admin-managed quick highlights and a calmer information hierarchy", () => {
  assert.match(modalSource, /product\.highlights\?\.map/)
  assert.match(modalSource, /displayHighlights\.map/)
  assert.match(modalSource, /Informações rápidas/)
  assert.equal(modalSource.includes("text-yellow-500"), false)
})

test("modal keeps admin-managed details notice and non-lead-time sections data-driven", () => {
  assert.match(modalSource, /product\.notice/)
  assert.match(modalSource, /product\.details\.map/)
  assert.match(modalSource, /product\.sections\.map/)
  assert.match(modalSource, /:\s*section\.paragraphs/)
  assert.match(modalSource, /paragraphs\.map/)
})

test("modal keeps product copy data-driven instead of embedding legacy rollback catalog copy", () => {
  assert.doesNotMatch(modalSource, /@\/data\/products|\.\.\/data\/products/)
  assert.doesNotMatch(modalSource, /60 cartas|papel fotográfico com laminação|torneios sancionados/i)
})
