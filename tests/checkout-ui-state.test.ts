import assert from "node:assert/strict"
import test from "node:test"
import {
  applyShippingChanged,
  calculateCheckoutTotalCents,
  invalidateCheckoutSelection,
  parseShippingOptions,
  selectShippingOption,
  type ShippingClientState,
} from "../lib/shipping-client.ts"

const option = {
  serviceId: "1",
  serviceName: "PAC",
  carrierName: "Correios",
  priceCents: 1842,
  deliveryDays: 6,
  quoteToken: "signed-quote",
}

const ready: ShippingClientState = {
  shippingOptions: [option],
  selectedShipping: option,
  shippingError: null,
  checkoutAttemptId: "550e8400-e29b-41d4-a716-446655440000",
}

test("cart, CEP or address changes invalidate freight selection and checkout attempt", () => {
  assert.deepEqual(invalidateCheckoutSelection(ready), {
    shippingOptions: [],
    selectedShipping: null,
    shippingError: null,
    checkoutAttemptId: null,
  })
})

test("selecting freight preserves its signed quote token and resets checkout identity", () => {
  const next = selectShippingOption(
    { ...ready, selectedShipping: null, checkoutAttemptId: "old-attempt" },
    option,
  )
  assert.equal(next.selectedShipping?.quoteToken, "signed-quote")
  assert.equal(next.checkoutAttemptId, null)
})

test("shipping_changed replaces options, clears selection and does not keep retry identity", () => {
  const refreshed = [{ ...option, priceCents: 1990, quoteToken: "new-signed-quote" }]
  const next = applyShippingChanged(ready, refreshed)
  assert.deepEqual(next.shippingOptions, refreshed)
  assert.equal(next.selectedShipping, null)
  assert.equal(next.checkoutAttemptId, null)
  assert.match(next.shippingError ?? "", /atualizado/i)
})

test("displayed total equals trusted product subtotal plus selected freight", () => {
  assert.equal(calculateCheckoutTotalCents(11990, option), 13832)
  assert.equal(calculateCheckoutTotalCents(11990, null), 11990)
})


test("shipping option parser accepts only complete trusted client shapes", () => {
  assert.deepEqual(parseShippingOptions([option]), [option])
  assert.equal(parseShippingOptions({}), null)
  assert.equal(parseShippingOptions([{ ...option, quoteToken: "" }]), null)
  assert.equal(parseShippingOptions([{ ...option, priceCents: 0 }]), null)
})
