import assert from "node:assert/strict"
import test from "node:test"
import {
  isAllowedMercadoPagoCheckoutUrl,
  selectMercadoPagoCheckoutUrl,
} from "../lib/server/checkout-url.ts"

test("uses init point for Checkout Pro in both test and production environments", () => {
  const preference = {
    initPoint: "https://www.mercadopago.com/checkout/v1/redirect?pref_id=prod",
    sandboxInitPoint: "https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=test",
  }

  assert.equal(selectMercadoPagoCheckoutUrl(preference, "sandbox"), preference.initPoint)
  assert.equal(selectMercadoPagoCheckoutUrl(preference, "production"), preference.initPoint)
})

test("does not require sandbox_init_point when using automatic test credentials", () => {
  const preference = {
    initPoint: "https://www.mercadopago.com/checkout/v1/redirect?pref_id=prod",
  }

  assert.equal(selectMercadoPagoCheckoutUrl(preference, "sandbox"), preference.initPoint)
})

test("accepts genuine Mercado Pago HTTPS hosts", () => {
  assert.equal(
    isAllowedMercadoPagoCheckoutUrl(
      "https://www.mercadopago.com/checkout/v1/redirect?pref_id=prod",
    ),
    true,
  )
  assert.equal(
    isAllowedMercadoPagoCheckoutUrl(
      "https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=test",
    ),
    true,
  )
  assert.equal(
    isAllowedMercadoPagoCheckoutUrl(
      "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=br",
    ),
    true,
  )
})

test("rejects lookalike, credentialed, non-HTTPS and malformed redirects", () => {
  const invalid = [
    "http://www.mercadopago.com/checkout",
    "https://mercadopago.com.evil.test/checkout",
    "https://evilmercadopago.com/checkout",
    "https://mercadopago.com@evil.test/checkout",
    "https://user:pass@www.mercadopago.com/checkout",
    "javascript:alert(1)",
    "not a url",
  ]

  for (const value of invalid) {
    assert.equal(isAllowedMercadoPagoCheckoutUrl(value), false, value)
  }
})
