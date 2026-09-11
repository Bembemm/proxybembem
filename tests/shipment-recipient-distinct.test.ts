import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { NextRequest } from "next/server.js"
import { buildShipmentPreparationSnapshot } from "../lib/server/shipment-snapshot.ts"
import { createAdminShipmentPrepareActionHandler } from "../lib/server/admin-shipment-actions.ts"

const ORDER_ID = "11111111-1111-4111-8111-111111111111"
const ADMIN_ID = "22222222-2222-4222-8222-222222222222"
const AUTH_SESSION_ID = "33333333-3333-4333-8333-333333333333"
const SENDER_CPF = "52998224725"

function orderWithCpf(customerCpf: string) {
  return {
    id: ORDER_ID,
    order_number: "PB-CPF-DISTINCT",
    customer_name: "Cliente Teste",
    customer_email: "cliente@example.com",
    customer_cpf: customerCpf,
    whatsapp: "11999999999",
    cep: "01001000",
    address_street: "Praça da Sé",
    address_number: "100",
    address_complement: null,
    address_neighborhood: "Sé",
    address_city: "São Paulo",
    address_state: "SP",
    items: [
      {
        productId: 1,
        title: "Deck Commander Proxy 100 Cartas",
        unitPriceCents: 11990,
        quantity: 1,
        shipping: { weightKg: 0.5, lengthCm: 25, widthCm: 19, heightCm: 4 },
      },
    ],
    subtotal_cents: 11990,
    shipping_provider: "melhor_envio",
    shipping_service_id: "1",
    shipping_service_name: "PAC",
    shipping_carrier_name: "Correios",
    shipping_delivery_days: 6,
    shipping_cents: 1842,
    shipping_snapshot: {
      destinationCep: "01001000",
      service: {
        id: "1",
        name: "PAC",
        carrier: "Correios",
        priceCents: 1842,
        deliveryDays: 6,
      },
      packages: [
        {
          dimensions: { height: 4, width: 19, length: 25 },
          weight: "0.5",
          insurance_value: "119.90",
          products: [{ id: "1", quantity: 1 }],
        },
      ],
      products: [
        {
          productId: 1,
          quantity: 1,
          widthCm: 19,
          heightCm: 4,
          lengthCm: 25,
          weightKg: 0.5,
          insuranceValue: 119.9,
        },
      ],
    },
    total_cents: 13832,
    payment_provider: "mercadopago",
    preference_id: "pref-test",
    payment_id: "pay-test",
    payment_status: "approved",
    payment_status_detail: "accredited",
    fulfillment_status: "ready_to_ship",
    created_at: "2026-09-10T12:00:00.000Z",
    updated_at: "2026-09-10T12:00:00.000Z",
  }
}

const sender = {
  id: "44444444-4444-4444-8444-444444444444",
  environment: "production" as const,
  fullName: "Breno Bembem",
  cpf: SENDER_CPF,
  email: "contato@proxybembem.com.br",
  phone: "44999999999",
  postalCode: "86730000",
  street: "Rua do Remetente",
  number: "10",
  complement: null,
  neighborhood: "Centro",
  city: "Astorga",
  state: "PR",
  version: 2,
  updatedAt: "2026-09-10T12:00:00.000Z",
}

test("PF declaration rejects recipient CPF equal to sender CPF before shipment creation", () => {
  assert.throws(
    () =>
      buildShipmentPreparationSnapshot({
        order: orderWithCpf(SENDER_CPF) as never,
        sender,
        expectedOriginCep: "86730000",
      }),
    (error: unknown) =>
      error instanceof Error &&
      (error as Error & { code?: string }).code === "recipient_matches_sender",
  )
})

test("admin prepare maps equal sender/recipient CPF to explicit safe feedback", async () => {
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
  process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example"
  try {
    const POST = createAdminShipmentPrepareActionHandler({
      authorizeAdmin: async () => ({
        ok: true as const,
        principal: { userId: ADMIN_ID, authSessionId: AUTH_SESSION_ID, aal: "aal2" as const },
      }),
      consumeRateLimit: async () => true,
      prepareShipment: async () => ({
        outcome: "invalid_snapshot" as const,
        reason: "recipient_matches_sender",
      }),
    })

    const response = await POST(
      new NextRequest(
        `https://preview.example/api/internal/admin/orders/${ORDER_ID}/shipment/prepare`,
        {
          method: "POST",
          headers: {
            origin: "https://preview.example",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams(),
        },
      ),
      { params: Promise.resolve({ id: ORDER_ID }) },
    )

    assert.equal(response.status, 303)
    assert.equal(
      response.headers.get("location"),
      `/admin/pedidos/${ORDER_ID}?shipment=recipient-same-as-sender`,
    )
  } finally {
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl
  }
})

test("admin explains that recipient CPF must differ from sender CPF", async () => {
  const page = await readFile(
    new URL("../app/admin/pedidos/[id]/page.tsx", import.meta.url),
    "utf8",
  )
  assert.match(page, /["']recipient-same-as-sender["']\s*:/)
  assert.match(page, /CPF[^\n]*destinat[aá]rio[^\n]*diferente[^\n]*remetente/i)
})
