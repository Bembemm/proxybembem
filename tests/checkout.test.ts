import test from "node:test"
import assert from "node:assert/strict"
import {
  formatWhatsapp,
  normalizeCheckoutData,
  validateCheckout,
  type CheckoutData,
} from "../lib/checkout.ts"

const valid: CheckoutData = {
  nome: "Breno Bembem",
  whatsapp: "(44) 99125-0332",
  cep: "86730-000",
  rua: "Rua das Cartas",
  numero: "123",
  complemento: "Apto 4",
  bairro: "Centro",
  cidade: "Astorga",
  uf: "PR",
}

test("formats Brazilian WhatsApp numbers", () => {
  assert.equal(formatWhatsapp("44991250332"), "(44) 99125-0332")
  assert.equal(formatWhatsapp("4430250332"), "(44) 3025-0332")
})

test("accepts valid customer and complete delivery address", () => {
  assert.deepEqual(validateCheckout(valid), {})
})

test("normalizes checkout data before server use", () => {
  assert.deepEqual(
    normalizeCheckoutData({
      ...valid,
      nome: "  Breno\u00a0  Bembem  ",
      whatsapp: "(44) 99125-0332",
      cep: "86730-000",
      rua: "  Rua   das Cartas ",
      complemento: "  Fundos  ",
      uf: "pr",
    }),
    {
      ...valid,
      nome: "Breno Bembem",
      whatsapp: "44991250332",
      cep: "86730000",
      rua: "Rua das Cartas",
      complemento: "Fundos",
      uf: "PR",
    },
  )
})

test("rejects malformed contact, CEP and required address fields", () => {
  const errors = validateCheckout({
    ...valid,
    whatsapp: "123",
    cep: "11111-111",
    rua: " ",
    numero: " ",
    bairro: "A",
    cidade: "A",
    uf: "parana",
  })

  assert.ok(errors.whatsapp)
  assert.ok(errors.cep)
  assert.ok(errors.rua)
  assert.ok(errors.numero)
  assert.ok(errors.bairro)
  assert.ok(errors.cidade)
  assert.equal(errors.uf, "Informe a UF com 2 letras.")
})

test("enforces address field length limits while keeping complement optional", () => {
  assert.deepEqual(validateCheckout({ ...valid, complemento: "" }), {})
  assert.ok(validateCheckout({ ...valid, rua: "R".repeat(121) }).rua)
  assert.ok(validateCheckout({ ...valid, numero: "1".repeat(21) }).numero)
  assert.ok(validateCheckout({ ...valid, complemento: "C".repeat(81) }).complemento)
  assert.ok(validateCheckout({ ...valid, bairro: "B".repeat(81) }).bairro)
  assert.ok(validateCheckout({ ...valid, cidade: "C".repeat(81) }).cidade)
})
