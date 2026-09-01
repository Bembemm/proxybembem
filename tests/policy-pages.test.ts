import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

function readRequired(path: string) {
  const url = new URL(`../${path}`, import.meta.url)
  assert.equal(existsSync(url), true, `${path} must exist`)
  return readFileSync(url, "utf8")
}

test("privacy page explains order data, providers and contact", () => {
  const source = readRequired("app/privacidade/page.tsx")

  for (const required of [
    "Privacidade",
    "nome",
    "WhatsApp",
    "endereço",
    "Mercado Pago",
    "Melhor Envio",
    "Vercel Analytics",
    "contato@proxybembem.com.br",
  ]) {
    assert.match(source, new RegExp(required, "i"), required)
  }
})

test("terms page states proxy status, payment truth and freight rules", () => {
  const source = readRequired("app/termos/page.tsx")

  for (const required of [
    "não oficiais",
    "torneios sancionados",
    "Mercado Pago",
    "Melhor Envio",
    "endereço",
    "direitos",
  ]) {
    assert.match(source, new RegExp(required, "i"), required)
  }
})

test("refund page describes support cases without blanket non-refundable language", () => {
  const source = readRequired("app/trocas-e-reembolsos/page.tsx")
  const lower = source.toLocaleLowerCase("pt-BR")

  for (const required of [
    "danificado",
    "defeito",
    "cancelamento",
    "reembolso",
    "transportadora",
    "legislação aplicável",
    "contato@proxybembem.com.br",
  ]) {
    assert.equal(lower.includes(required), true, required)
  }

  assert.equal(lower.includes("não reembolsável"), false)
  assert.equal(lower.includes("sem devolução"), false)
})

test("footer links to all storefront policy pages", () => {
  const footer = readRequired("components/footer.tsx")

  assert.match(footer, /href="\/privacidade"/)
  assert.match(footer, /href="\/termos"/)
  assert.match(footer, /href="\/trocas-e-reembolsos"/)
})
