import test from "node:test"
import assert from "node:assert/strict"
import { formatWhatsapp, validateCheckout } from "../lib/checkout.ts"

test("formats Brazilian WhatsApp numbers", () => {
  assert.equal(formatWhatsapp("44991250332"), "(44) 99125-0332")
  assert.equal(formatWhatsapp("4430250332"), "(44) 3025-0332")
})

test("accepts valid name, WhatsApp and CEP", () => {
  assert.deepEqual(
    validateCheckout({ nome: "Breno Bembem", whatsapp: "(44) 99125-0332", cep: "87000-000" }),
    {},
  )
})

test("rejects malformed WhatsApp and repeated CEP", () => {
  const errors = validateCheckout({ nome: "Breno", whatsapp: "123", cep: "11111-111" })
  assert.ok(errors.whatsapp)
  assert.ok(errors.cep)
})
