import assert from "node:assert/strict"
import test from "node:test"

import {
  ORDER_NOTIFICATION_TYPES,
  buildOrderNotificationPayload,
  isOrderNotificationType,
  renderOrderNotification,
} from "../lib/server/order-notification-templates.ts"

const orderId = "123e4567-e89b-42d3-a456-426614174000"

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    orderId,
    orderNumber: "PB-ABCDEF123456",
    customerName: 'Cliente <script>alert("x")</script>',
    items: [
      {
        title: 'Deck <b>Commander</b> & "Teste"',
        unitPriceCents: 5_000,
        quantity: 1,
      },
    ],
    subtotalCents: 5_000,
    shippingCents: 999,
    totalCents: 5_999,
    address: {
      street: "Rua <Principal>",
      number: "123",
      complement: "Casa & fundos",
      neighborhood: "Centro",
      city: "Curitiba",
      state: "PR",
      cep: "80000000",
    },
    carrierName: "Correios",
    serviceName: "SEDEX",
    trackingCode: "AB123456789BR",
    ...overrides,
  }
}

test("exposes exactly the eight approved transactional notification types", () => {
  assert.deepEqual(ORDER_NOTIFICATION_TYPES, [
    "payment_approved",
    "production_started",
    "ready_to_ship",
    "shipped",
    "delivered",
    "canceled",
    "refunded",
    "charged_back",
  ])
  for (const type of ORDER_NOTIFICATION_TYPES) {
    assert.equal(isOrderNotificationType(type), true)
  }
  assert.equal(isOrderNotificationType("opened"), false)
  assert.equal(isOrderNotificationType("clicked"), false)
  assert.equal(isOrderNotificationType("marketing"), false)
})

test("builds an immutable customer-safe payment-approved payload and authenticated order URL", () => {
  const payload = buildOrderNotificationPayload(
    "payment_approved",
    snapshot({
      customerCpf: "12345678900",
      paymentId: "mp-secret-id",
      providerMetadata: { raw: "secret" },
    }) as never,
  )

  assert.equal(payload.type, "payment_approved")
  assert.equal(payload.orderId, orderId)
  assert.equal(payload.orderNumber, "PB-ABCDEF123456")
  assert.equal(
    payload.orderUrl,
    `https://www.proxybembem.com.br/minha-conta/pedidos/${orderId}`,
  )
  assert.deepEqual(payload.items, [
    {
      title: 'Deck <b>Commander</b> & "Teste"',
      unitPriceCents: 5_000,
      quantity: 1,
    },
  ])
  assert.equal(payload.subtotalCents, 5_000)
  assert.equal(payload.shippingCents, 999)
  assert.equal(payload.totalCents, 5_999)
  assert.deepEqual(payload.address, {
    street: "Rua <Principal>",
    number: "123",
    complement: "Casa & fundos",
    neighborhood: "Centro",
    city: "Curitiba",
    state: "PR",
    cep: "80000000",
  })

  const serialized = JSON.stringify(payload)
  assert.doesNotMatch(serialized, /cpf|12345678900/i)
  assert.doesNotMatch(serialized, /paymentId|mp-secret-id/i)
  assert.doesNotMatch(serialized, /providerMetadata|secret/i)
})

test("renders all eight approved subjects with HTML and text plus one authenticated order link", () => {
  const expectedSubjects = new Map([
    ["payment_approved", "Pagamento aprovado — pedido PB-ABCDEF123456"],
    ["production_started", "Seu pedido entrou em produção — PB-ABCDEF123456"],
    ["ready_to_ship", "Seu pedido está pronto para envio — PB-ABCDEF123456"],
    ["shipped", "Seu pedido foi enviado — PB-ABCDEF123456"],
    ["delivered", "Seu pedido foi entregue — PB-ABCDEF123456"],
    ["canceled", "Seu pedido foi cancelado — PB-ABCDEF123456"],
    ["refunded", "Reembolso concluído — PB-ABCDEF123456"],
    ["charged_back", "Pagamento revertido — PB-ABCDEF123456"],
  ])

  for (const type of ORDER_NOTIFICATION_TYPES) {
    const rendered = renderOrderNotification(
      buildOrderNotificationPayload(type, snapshot() as never),
    )
    assert.equal(rendered.subject, expectedSubjects.get(type))
    assert.match(rendered.html, /ProxyBembem/)
    assert.match(rendered.html, /#7c3aed|#8b5cf6/i)
    assert.match(rendered.html, /border-radius:18px/)
    assert.match(rendered.text, /ProxyBembem/)
    assert.match(rendered.html, new RegExp(orderId))
    assert.match(rendered.text, new RegExp(orderId))
    assert.match(rendered.html, /Ver meu pedido|Acompanhar meu pedido/)
  }
})

test("accepts blank optional address complement from persisted orders", () => {
  const payload = buildOrderNotificationPayload(
    "payment_approved",
    snapshot({
      address: {
        street: "Rua Exemplo",
        number: "10",
        complement: "",
        neighborhood: "Centro",
        city: "Astorga",
        state: "PR",
        cep: "86730000",
      },
    }) as never,
  )

  assert.equal(payload.address.complement, null)
  assert.doesNotThrow(() => renderOrderNotification(payload))
})

test("payment-approved email includes item quantities, subtotal, shipping, total and delivery address", () => {
  const rendered = renderOrderNotification(
    buildOrderNotificationPayload("payment_approved", snapshot() as never),
  )

  assert.match(rendered.text, /Deck <b>Commander<\/b> & "Teste" — 1 x R\$ 50,00/)
  assert.match(rendered.text, /Subtotal: R\$ 50,00/)
  assert.match(rendered.text, /Frete: R\$ 9,99/)
  assert.match(rendered.text, /Total pago: R\$ 59,99/)
  assert.match(rendered.text, /Rua <Principal>, 123/)
  assert.match(rendered.text, /Casa & fundos/)
  assert.match(rendered.text, /Centro/)
  assert.match(rendered.text, /Curitiba - PR/)
  assert.match(rendered.text, /CEP 80000-000/)
})

test("shipped email includes available carrier, service and tracking without claiming label generation was shipment", () => {
  const rendered = renderOrderNotification(
    buildOrderNotificationPayload("shipped", snapshot() as never),
  )

  assert.match(rendered.text, /Correios/)
  assert.match(rendered.text, /SEDEX/)
  assert.match(rendered.text, /AB123456789BR/)
  assert.match(rendered.html, /Acompanhar meu pedido/)
  assert.match(rendered.text, /aplicativo ou site oficial dos Correios/i)
  assert.match(rendered.html, /aplicativo ou site oficial dos Correios/i)
  assert.doesNotMatch(rendered.text, /etiqueta comprada|etiqueta gerada/i)
})

test("canceled, refunded and charged-back copy keep operational and financial meanings separate", () => {
  const canceled = renderOrderNotification(
    buildOrderNotificationPayload("canceled", snapshot() as never),
  )
  const refunded = renderOrderNotification(
    buildOrderNotificationPayload("refunded", snapshot() as never),
  )
  const chargedBack = renderOrderNotification(
    buildOrderNotificationPayload("charged_back", snapshot() as never),
  )

  assert.match(canceled.text, /pedido foi cancelado/i)
  assert.match(canceled.text, /devolução do valor.*processo separado/i)
  assert.doesNotMatch(canceled.text, /reembolso (?:foi |está )?concluído/i)

  assert.match(refunded.text, /reembolso.*concluído/i)
  assert.doesNotMatch(refunded.text, /chargeback/i)

  assert.match(chargedBack.text, /pagamento.*revertido/i)
  assert.doesNotMatch(chargedBack.text, /reembolso concluído/i)
})

test("HTML escapes all customer-controlled text while plain text remains readable", () => {
  const rendered = renderOrderNotification(
    buildOrderNotificationPayload("payment_approved", snapshot() as never),
  )

  assert.doesNotMatch(rendered.html, /<script>|<b>Commander<\/b>|Rua <Principal>/)
  assert.match(rendered.html, /&lt;script&gt;/)
  assert.match(rendered.html, /Deck &lt;b&gt;Commander&lt;\/b&gt; &amp; &quot;Teste&quot;/)
  assert.match(rendered.html, /Rua &lt;Principal&gt;/)
  assert.match(rendered.html, /Casa &amp; fundos/)
  assert.match(rendered.text, /<script>/)
})

test("rejects invalid UUIDs, order numbers, payloads and unexpected notification types", () => {
  assert.throws(
    () => buildOrderNotificationPayload("payment_approved", snapshot({ orderId: "not-a-uuid" }) as never),
    /invalid notification snapshot/i,
  )
  assert.throws(
    () => buildOrderNotificationPayload("payment_approved", snapshot({ orderId: "00000000-0000-0000-0000-000000000000" }) as never),
    /invalid notification snapshot/i,
  )
  assert.throws(
    () => buildOrderNotificationPayload("payment_approved", snapshot({ orderNumber: "123" }) as never),
    /invalid notification snapshot/i,
  )
  assert.throws(
    () => buildOrderNotificationPayload("opened" as never, snapshot() as never),
    /invalid notification type/i,
  )
  assert.throws(
    () => renderOrderNotification({ type: "payment_approved" } as never),
    /invalid notification payload/i,
  )
})
