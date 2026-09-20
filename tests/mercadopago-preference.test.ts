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
      shipping: { weightKg: 0.5, lengthCm: 25, widthCm: 19, heightCm: 4 },
    },
    {
      productId: 2,
      title: "Deck Proxy 60 Cartas",
      unitPriceCents: 6999,
      quantity: 2,
      shipping: { weightKg: 0.5, lengthCm: 25, widthCm: 19, heightCm: 4 },
    },
  ],
  shipping: {
    serviceName: "PAC",
    carrierName: "Correios",
    amountCents: 1842,
  },
  returnUrl: "https://store.test/pedido/token",
  payerName: "Breno Bembem",
  expirationDateFrom: "2026-09-18T12:00:00.000Z",
  expirationDateTo: "2026-09-21T12:00:00.000Z",
}

test("adds trusted mixed products and freight as explicit Mercado Pago preference items", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const payload = JSON.parse(String(init?.body)) as {
        items: Array<{ id: string; unit_price: number; quantity: number; title: string }>
        external_reference: string
        expires: boolean
        expiration_date_from: string
        expiration_date_to: string
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
          id: "2",
          title: "Deck Proxy 60 Cartas",
          quantity: 2,
          unit_price: 69.99,
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
      assert.equal(totalCents, 27830)
      assert.equal(payload.external_reference, "PB-A1B2C3D4E5F6")
      assert.equal(payload.expires, true)
      assert.equal(payload.expiration_date_from, baseInput.expirationDateFrom)
      assert.equal(payload.expiration_date_to, baseInput.expirationDateTo)

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

test("does not override the application-level Mercado Pago Webhook URL per preference", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const payload = JSON.parse(String(init?.body)) as {
        notification_url?: unknown
      }
      assert.equal("notification_url" in payload, false)

      return new Response(
        JSON.stringify({
          id: "pref-app-webhook",
          init_point:
            "https://www.mercadopago.com/checkout/v1/redirect?pref_id=pref-app-webhook",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      )
    },
  )

  const result = await createMercadoPagoPreference(baseInput)
  assert.equal(result.id, "pref-app-webhook")
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
