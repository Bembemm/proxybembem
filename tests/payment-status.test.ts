import test from "node:test"
import assert from "node:assert/strict"
import { derivePaymentUpdate } from "../lib/server/payment-status.ts"

test("does not downgrade an approved order from a different payment event", () => {
  const update = derivePaymentUpdate({
    currentStatus: "approved",
    currentPaymentId: "100",
    incomingStatus: "rejected",
    incomingPaymentId: "101",
    amountMatches: true,
    statusDetail: "cc_rejected_other_reason",
  })

  assert.equal(update, null)
})

test("allows refund or chargeback of the approved payment", () => {
  assert.deepEqual(
    derivePaymentUpdate({
      currentStatus: "approved",
      currentPaymentId: "100",
      incomingStatus: "refunded",
      incomingPaymentId: "100",
      amountMatches: true,
      statusDetail: "refunded",
    }),
    {
      paymentId: "100",
      paymentStatus: "refunded",
      paymentStatusDetail: "refunded",
    },
  )
})

test("sends approved amount mismatches to manual review", () => {
  assert.deepEqual(
    derivePaymentUpdate({
      currentStatus: "pending",
      currentPaymentId: null,
      incomingStatus: "approved",
      incomingPaymentId: "100",
      amountMatches: false,
      statusDetail: "accredited",
    }),
    {
      paymentId: "100",
      paymentStatus: "manual_review",
      paymentStatusDetail: "amount_or_currency_mismatch",
    },
  )
})
