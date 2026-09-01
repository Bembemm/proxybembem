import test from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { validateMercadoPagoWebhookSignature } from "../lib/server/mercadopago.ts"

test("accepts the documented Mercado Pago HMAC manifest", () => {
  const secret = "test-secret"
  const dataId = "123456"
  const requestId = "bb56a2f1-6aae-46ac-982e-9dcd3581d08e"
  const ts = "1742505638683"
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex")

  assert.equal(
    validateMercadoPagoWebhookSignature({
      xSignature: `ts=${ts},v1=${v1}`,
      xRequestId: requestId,
      dataId,
      secret,
    }),
    true,
  )
})

test("rejects a modified webhook signature", () => {
  assert.equal(
    validateMercadoPagoWebhookSignature({
      xSignature: "ts=1742505638683,v1=deadbeef",
      xRequestId: "request-id",
      dataId: "123456",
      secret: "test-secret",
    }),
    false,
  )
})
