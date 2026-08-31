import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { products } from "../data/products.ts"

const modalSource = readFileSync(
  new URL("../components/product-detail-modal.tsx", import.meta.url),
  "utf8",
)

function productById(id: number) {
  const product = products.find((candidate) => candidate.id === id)
  assert.ok(product, `missing product ${id}`)
  return product
}

test("60-card product explains the offer in buyer-first order", () => {
  const product = productById(2)

  assert.deepEqual(product.highlights, [
    "60 cartas",
    "Lista escolhida por você",
    "Produção em até 3 dias úteis",
  ])
  assert.match(product.description, /Você escolhe as 60 cartas da sua lista/i)
  assert.deepEqual(
    product.details.map((detail) => detail.label),
    ["O QUE VOCÊ RECEBE", "QUALIDADE", "VERSO", "COMO ESCOLHER AS CARTAS", "ARTES"],
  )
  assert.match(product.details[1]?.value ?? "", /papel fotográfico com laminação/i)
  assert.match(product.details[2]?.value ?? "", /verso branco/i)
})

test("product detail keeps the non-official proxy notice clear but non-repetitive", () => {
  for (const product of products) {
    assert.equal(product.notice, "Informações importantes")

    const importantSection = product.sections.find((section) => section.title === "IMPORTANTE")
    assert.ok(importantSection)
    assert.match(importantSection.paragraphs.join(" "), /proxy não oficial/i)
    assert.match(importantSection.paragraphs.join(" "), /torneios sancionados/i)

    const prazoSection = product.sections.find((section) => section.title === "PRAZO")
    assert.ok(prazoSection)
    assert.match(prazoSection.paragraphs.join(" "), /3 dias úteis/i)

    assert.equal(product.description.toLocaleUpperCase("pt-BR").includes("NÃO SÃO CARTAS ORIGINAIS"), false)
  }
})

test("modal renders quick highlights and uses a calmer information hierarchy", () => {
  assert.match(modalSource, /product\.highlights\?\.map/)
  assert.match(modalSource, /Informações rápidas/)
  assert.equal(modalSource.includes("text-yellow-500"), false)
})
