import assert from "node:assert/strict"
import test from "node:test"
import {
  allowedAdminFulfillmentTransitions,
  assertAdminFulfillmentTransition,
  isFulfillmentStatus,
} from "../lib/server/fulfillment.ts"

test("recognizes only the approved fulfillment vocabulary", () => {
  assert.equal(isFulfillmentStatus("awaiting_payment"), true)
  assert.equal(isFulfillmentStatus("awaiting_production"), true)
  assert.equal(isFulfillmentStatus("in_production"), true)
  assert.equal(isFulfillmentStatus("ready_to_ship"), true)
  assert.equal(isFulfillmentStatus("shipped"), true)
  assert.equal(isFulfillmentStatus("completed"), true)
  assert.equal(isFulfillmentStatus("canceled"), true)
  assert.equal(isFulfillmentStatus("problem"), false)
  assert.equal(isFulfillmentStatus(null), false)
})

test("keeps the payment-approved automatic transition out of admin controls", () => {
  assert.deepEqual(allowedAdminFulfillmentTransitions("awaiting_payment"), ["canceled"])
})

test("allows only the approved admin transition matrix", () => {
  assert.deepEqual(allowedAdminFulfillmentTransitions("awaiting_production"), [
    "in_production",
    "canceled",
  ])
  assert.deepEqual(allowedAdminFulfillmentTransitions("in_production"), [
    "ready_to_ship",
    "canceled",
  ])
  assert.deepEqual(allowedAdminFulfillmentTransitions("ready_to_ship"), [
    "shipped",
    "canceled",
  ])
  assert.deepEqual(allowedAdminFulfillmentTransitions("shipped"), ["completed"])
  assert.deepEqual(allowedAdminFulfillmentTransitions("completed"), [])
  assert.deepEqual(allowedAdminFulfillmentTransitions("canceled"), [])
})

test("rejects production start without approved payment", () => {
  assert.throws(
    () =>
      assertAdminFulfillmentTransition({
        paymentStatus: "pending",
        from: "awaiting_production",
        to: "in_production",
      }),
    /approved payment required/,
  )
})

test("rejects impossible jumps even when payment is approved", () => {
  assert.throws(
    () =>
      assertAdminFulfillmentTransition({
        paymentStatus: "approved",
        from: "awaiting_production",
        to: "shipped",
      }),
    /invalid fulfillment transition/,
  )
})
