import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const modalSource = readFileSync(
  new URL("../components/product-detail-modal.tsx", import.meta.url),
  "utf8",
)

test("modal uses the approved white responsive product-detail layout", () => {
  assert.match(modalSource, /import Image from "next\/image"/)
  assert.ok(modalSource.includes("max-w-[980px]"))
  assert.ok(modalSource.includes("bg-white"))
  assert.ok(modalSource.includes("text-slate-950"))
  assert.ok(modalSource.includes("grid-cols-1"))
  assert.ok(modalSource.includes("lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]"))
  assert.match(modalSource, /src=\{product\.image\}/)
  assert.ok(modalSource.includes("rounded-2xl"))
  assert.equal(modalSource.includes("bg-slate-900/95"), false)
})

test("modal renders admin-managed highlights as the top feature list", () => {
  assert.match(modalSource, /product\.highlights\?\.map/)
  assert.match(modalSource, /displayHighlights\.map/)
  assert.ok(modalSource.includes("bg-violet-50"))
  assert.equal(modalSource.includes("Informações rápidas"), false)
  assert.equal(modalSource.includes("text-yellow-500"), false)
})

test("modal keeps admin-managed details notice and non-lead-time sections data-driven in information cards", () => {
  assert.match(modalSource, /product\.notice/)
  assert.match(modalSource, /product\.details\.map/)
  assert.match(modalSource, /product\.sections\.map/)
  assert.match(modalSource, /:\s*section\.paragraphs/)
  assert.match(modalSource, /paragraphs\.map/)
  assert.ok(modalSource.includes("Informações importantes"))
  assert.ok(modalSource.includes("bg-violet-50/60"))
})

test("modal preserves cart feedback and keeps product copy data-driven", () => {
  assert.match(modalSource, /itemInCart/)
  assert.match(modalSource, /justAdded/)
  assert.match(modalSource, /Adicionar ao Carrinho/)
  assert.doesNotMatch(modalSource, /@\/data\/products|\.\.\/data\/products/)
  assert.doesNotMatch(modalSource, /60 cartas|papel fotográfico com laminação|torneios sancionados/i)
})
