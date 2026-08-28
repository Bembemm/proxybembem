import assert from "node:assert/strict"
import test from "node:test"
import { createMercadoPagoPreference } from "../lib/server/mercadopago.ts"

const baseInput = {
  accessToken: "provider-token",
  orderNumber: "PB-A1B2C3D4E5F6",
  items: [
    {
      productId: 1,
      title: "Deck Commander Proxy 100 Cartas",
      unitPriceCents: 11990,
      quantity: 1,
      shipping: { weightKg: 0.25, lengthCm: 25, widthCm: 19, heightCm: 4 },
    },
  ],
  shipping: {
    serviceName: "PAC",
    carrierName: "Correios",
    amountCents: 1842,
  },
  notificationUrl: "https://store.test/api/mercadopago/webhook",
  returnUrl: "https://store.test/pedido/token",
  payerName: "Breno Bembem",
}

test("adds trusted freight as an explicit Mercado Pago preference item", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const payload = JSON.parse(String(init?.body)) as {
        items: Array<{ id: string; unit_price: number; quantity: number; title: string }>
        external_reference: string
      }

      assert.deepEqual(payload.items, [
        {
          id: "1",
          title: "Deck Commander Proxy 100 Cartas",
          quantity: 1,
          unit_price: 119.9,
          currency_id: "BRL",
        },
        {
          id: "shipping",
          title: "Frete - Correios / PAC",
          quantity: 1,
          unit_price: 18.42,
          currency_id: "BRL",
        },
      ])
      const totalCents = payload.items.reduce(
        (sum, item) => sum + Math.round(item.unit_price * 100) * item.quantity,
        0,
      )
      assert.equal(totalCents, 13832)
      assert.equal(payload.external_reference, "PB-A1B2C3D4E5F6")

      return new Response(
        JSON.stringify({
          id: "pref-1",
          init_point: "https://www.mercadopago.com/checkout/v1/redirect?pref_id=pref-1",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      )
    },
  )

  const result = await createMercadoPagoPreference(baseInput)
  assert.equal(result.id, "pref-1")
})

test("rejects invalid freight amounts before calling Mercado Pago", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("{}"))

  await assert.rejects(
    () =>
      createMercadoPagoPreference({
        ...baseInput,
        shipping: { ...baseInput.shipping, amountCents: 0 },
      }),
    /freight/i,
  )
  assert.equal(fetchMock.mock.callCount(), 0)
})
