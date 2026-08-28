import assert from "node:assert/strict"
import test from "node:test"
import { selectMercadoPagoCheckoutUrl } from "../lib/server/checkout-url.ts"

test("uses init point for Checkout Pro in both test and production environments", () => {
  const preference = {
    initPoint: "https://www.mercadopago.com/checkout/v1/redirect?pref_id=prod",
    sandboxInitPoint: "https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=test",
  }

  assert.equal(
    selectMercadoPagoCheckoutUrl(preference, "sandbox"),
    preference.initPoint,
  )
  assert.equal(
    selectMercadoPagoCheckoutUrl(preference, "production"),
    preference.initPoint,
  )
})

test("does not require sandbox_init_point when using automatic test credentials", () => {
  const preference = {
    initPoint: "https://www.mercadopago.com/checkout/v1/redirect?pref_id=prod",
  }

  assert.equal(
    selectMercadoPagoCheckoutUrl(preference, "sandbox"),
    preference.initPoint,
  )
})
