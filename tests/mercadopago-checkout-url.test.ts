import assert from "node:assert/strict"
import test from "node:test"
import { selectMercadoPagoCheckoutUrl } from "../lib/server/checkout-url.ts"

test("uses sandbox init point only when environment is sandbox", () => {
  const preference = {
    initPoint: "https://www.mercadopago.com/checkout/v1/redirect?pref_id=prod",
    sandboxInitPoint: "https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=test",
  }

  assert.equal(
    selectMercadoPagoCheckoutUrl(preference, "sandbox"),
    preference.sandboxInitPoint,
  )
  assert.equal(
    selectMercadoPagoCheckoutUrl(preference, "production"),
    preference.initPoint,
  )
})

test("fails closed when sandbox URL is missing", () => {
  assert.throws(
    () =>
      selectMercadoPagoCheckoutUrl(
        { initPoint: "https://www.mercadopago.com/checkout/v1/redirect?pref_id=prod" },
        "sandbox",
      ),
    /sandbox_init_point/i,
  )
})
