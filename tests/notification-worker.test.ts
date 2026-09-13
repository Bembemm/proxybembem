import assert from "node:assert/strict"
import test from "node:test"

const WORKER_ID = "11111111-1111-4111-8111-111111111111"
const NOTIFICATION_ID = "22222222-2222-4222-8222-222222222222"
const ORDER_ID = "33333333-3333-4333-8333-333333333333"

const validPayload = {
  version: 1,
  type: "production_started",
  orderId: ORDER_ID,
  orderNumber: "PB-A1B2C3D4E5F6",
  orderUrl: `https://www.proxybembem.com.br/minha-conta/pedidos/${ORDER_ID}`,
  customerName: "Cliente",
  items: [{ title: "Produto", unitPriceCents: 5999, quantity: 1 }],
  subtotalCents: 5999,
  shippingCents: 1200,
  totalCents: 7199,
  address: {
    street: "Rua Exemplo",
    number: "10",
    complement: null,
    neighborhood: "Centro",
    city: "Curitiba",
    state: "PR",
    cep: "80000000",
  },
  carrierName: null,
  serviceName: null,
  trackingCode: null,
}

async function loadWorker() {
  return import("../lib/server/notification-worker.ts")
}

test("worker sends each claimed row once with its stored idempotency key and records acceptance", async () => {
  const module = await loadWorker()
  const sends: unknown[] = []
  const completions: unknown[] = []

  const result = await module.processNotificationBatch({
    workerId: WORKER_ID,
    limit: 25,
    claim: async () => [{
      id: NOTIFICATION_ID,
      orderId: ORDER_ID,
      notificationType: "production_started",
      recipientEmail: "cliente@example.com",
      templatePayload: validPayload,
      providerIdempotencyKey: "stable-provider-key",
      attemptCount: 0,
    }],
    send: async (input) => {
      sends.push(input)
      return { outcome: "accepted" as const, messageId: "provider-message-id" }
    },
    complete: async (input) => {
      completions.push(input)
      return {
        outcome: "recorded" as const,
        notificationId: NOTIFICATION_ID,
        status: "sent" as const,
        attemptCount: 1,
      }
    },
  })

  assert.equal(sends.length, 1)
  assert.deepEqual(sends[0], {
    to: "cliente@example.com",
    subject: "Seu pedido entrou em produção — PB-A1B2C3D4E5F6",
    text: assert.stringContaining ? sends[0] : sends[0],
    html: assert.stringContaining ? sends[0] : sends[0],
    idempotencyKey: "stable-provider-key",
  })
  const send = sends[0] as Record<string, unknown>
  assert.match(String(send.text), /Produção iniciada/)
  assert.match(String(send.html), /Produção iniciada/)
  assert.deepEqual(completions, [{
    notificationId: NOTIFICATION_ID,
    workerId: WORKER_ID,
    outcome: "accepted",
    providerMessageId: "provider-message-id",
  }])
  assert.deepEqual(result, {
    claimed: 1,
    accepted: 1,
    retryScheduled: 0,
    failed: 0,
  })
})

test("worker maps retryable provider failures to the durable completion result", async () => {
  const module = await loadWorker()
  const completions: unknown[] = []
  const result = await module.processNotificationBatch({
    workerId: WORKER_ID,
    claim: async () => [{
      id: NOTIFICATION_ID,
      orderId: ORDER_ID,
      notificationType: "production_started",
      recipientEmail: "cliente@example.com",
      templatePayload: validPayload,
      providerIdempotencyKey: "stable-provider-key",
      attemptCount: 0,
    }],
    send: async () => ({ outcome: "retryable" as const, code: "provider_timeout" as const }),
    complete: async (input) => {
      completions.push(input)
      return {
        outcome: "recorded" as const,
        notificationId: NOTIFICATION_ID,
        status: "retry_scheduled" as const,
        attemptCount: 1,
      }
    },
  })

  assert.deepEqual(completions, [{
    notificationId: NOTIFICATION_ID,
    workerId: WORKER_ID,
    outcome: "retryable",
    errorCode: "provider_timeout",
  }])
  assert.deepEqual(result, { claimed: 1, accepted: 0, retryScheduled: 1, failed: 0 })
})

test("worker fails malformed claimed payload safely without sending content", async () => {
  const module = await loadWorker()
  let sendCalls = 0
  const completions: unknown[] = []

  const result = await module.processNotificationBatch({
    workerId: WORKER_ID,
    claim: async () => [{
      id: NOTIFICATION_ID,
      orderId: ORDER_ID,
      notificationType: "production_started",
      recipientEmail: "cliente@example.com",
      templatePayload: { ...validPayload, type: "shipped" },
      providerIdempotencyKey: "stable-provider-key",
      attemptCount: 0,
    }],
    send: async () => {
      sendCalls += 1
      return { outcome: "accepted" as const, messageId: "must-not-send" }
    },
    complete: async (input) => {
      completions.push(input)
      return {
        outcome: "recorded" as const,
        notificationId: NOTIFICATION_ID,
        status: "failed" as const,
        attemptCount: 1,
      }
    },
  })

  assert.equal(sendCalls, 0)
  assert.deepEqual(completions, [{
    notificationId: NOTIFICATION_ID,
    workerId: WORKER_ID,
    outcome: "rejected",
    errorCode: "invalid_notification_payload",
  }])
  assert.deepEqual(result, { claimed: 1, accepted: 0, retryScheduled: 0, failed: 1 })
})

test("worker never requests more than 25 rows", async () => {
  const module = await loadWorker()
  let seenLimit = 0
  await module.processNotificationBatch({
    workerId: WORKER_ID,
    limit: 999,
    claim: async ({ limit }) => {
      seenLimit = limit
      return []
    },
    send: async () => ({ outcome: "rejected" as const, code: "provider_rejected" as const }),
    complete: async () => {
      throw new Error("must not complete")
    },
  })
  assert.equal(seenLimit, 25)
})
