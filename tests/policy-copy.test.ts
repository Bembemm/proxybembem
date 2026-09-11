import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const SOURCE_FILES = [
  "components/footer.tsx",
  "components/checkout-form.tsx",
  "components/order-summary.tsx",
  "lib/checkout.ts",
]

function storefrontSource() {
  return SOURCE_FILES.map((path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")).join("\n")
}

test("customer-facing copy does not describe the obsolete Pix or post-checkout freight flow", () => {
  const source = storefrontSource().toLocaleLowerCase("pt-BR")

  for (const obsolete of [
    "pagamento via pix combinado no atendimento",
    "o frete não está incluído no subtotal e será calculado no atendimento",
    '"a calcular"',
  ]) {
    assert.equal(source.includes(obsolete), false, obsolete)
  }
})

test("storefront explains the current Mercado Pago and pre-payment freight flow", () => {
  const source = storefrontSource()

  assert.match(source, /Pagamento processado pelo Mercado Pago/)
  assert.match(source, /frete antes do pagamento/i)
})
