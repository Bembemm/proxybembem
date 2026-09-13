import assert from "node:assert/strict"
import test from "node:test"

const ORDER_ID = "11111111-1111-4111-8111-111111111111"
const NOTIFICATION_ID = "22222222-2222-4222-8222-222222222222"

async function withSupabaseEnv<T>(fn: () => Promise<T>) {
  const oldUrl = process.env.SUPABASE_URL
  const oldKey = process.env.SUPABASE_SECRET_KEY
  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "test-service-role-value"
  try {
    return await fn()
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY
    else process.env.SUPABASE_SECRET_KEY = oldKey
  }
}

test("listAdminOrderNotifications returns a strict sanitized chronological projection", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await import("../lib/server/admin-order-notifications.ts")
    t.mock.method(globalThis, "fetch", async (input, init) => {
      assert.equal(String(input), "https://example.supabase.co/rest/v1/rpc/admin_list_order_notifications")
      assert.equal(init?.method, "POST")
      assert.equal(init?.cache, "no-store")
      assert.deepEqual(JSON.parse(String(init?.body)), { p_order_id: ORDER_ID })
      return Response.json([
        {
          id: NOTIFICATION_ID,
          notification_type: "payment_approved",
          recipient_email: "cliente@example.com",
          status: "delivered",
          attempt_count: 1,
          last_error_code: null,
          resend_of_id: null,
          last_attempted_at: "2026-09-12T22:00:00.000Z",
          sent_at: "2026-09-12T22:00:01.000Z",
          delivered_at: "2026-09-12T22:00:02.000Z",
          bounced_at: null,
          failed_at: null,
          created_at: "2026-09-12T21:59:00.000Z",
        },
      ])
    })

    const rows = await module.listAdminOrderNotifications(ORDER_ID)
    assert.deepEqual(rows, [{
      id: NOTIFICATION_ID,
      notificationType: "payment_approved",
      recipientEmail: "cliente@example.com",
      status: "delivered",
      attemptCount: 1,
      lastErrorCode: null,
      resendOfId: null,
      lastAttemptedAt: "2026-09-12T22:00:00.000Z",
      sentAt: "2026-09-12T22:00:01.000Z",
      deliveredAt: "2026-09-12T22:00:02.000Z",
      bouncedAt: null,
      failedAt: null,
      createdAt: "2026-09-12T21:59:00.000Z",
    }])
    assert.doesNotMatch(JSON.stringify(rows), /template_payload|provider_message_id|provider_idempotency_key/i)
  })
})

test("admin notification history rejects malformed identifiers and rows", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await import("../lib/server/admin-order-notifications.ts")
    let calls = 0
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1
      return Response.json([{ id: "bad" }])
    })

    await assert.rejects(module.listAdminOrderNotifications("bad"), /Invalid admin order id/)
    assert.equal(calls, 0)

    await assert.rejects(module.listAdminOrderNotifications(ORDER_ID), /Admin notification history failed/)
    assert.equal(calls, 1)
  })
})

test("Portuguese labels cover every bounded notification status and type", async () => {
  const module = await import("../lib/server/admin-order-notifications.ts")
  assert.deepEqual(module.ADMIN_NOTIFICATION_STATUS_LABELS, {
    pending: "Pendente",
    processing: "Enviando",
    sent: "Enviado",
    delivered: "Entregue",
    retry_scheduled: "Aguardando nova tentativa",
    failed: "Falhou",
    bounced: "Rejeitado/Bounce",
  })
  assert.equal(module.ADMIN_NOTIFICATION_TYPE_LABELS.payment_approved, "Pagamento aprovado")
  assert.equal(module.ADMIN_NOTIFICATION_TYPE_LABELS.production_started, "Produção iniciada")
  assert.equal(module.ADMIN_NOTIFICATION_TYPE_LABELS.ready_to_ship, "Pronto para envio")
  assert.equal(module.ADMIN_NOTIFICATION_TYPE_LABELS.shipped, "Pedido enviado")
  assert.equal(module.ADMIN_NOTIFICATION_TYPE_LABELS.delivered, "Pedido entregue")
  assert.equal(module.ADMIN_NOTIFICATION_TYPE_LABELS.canceled, "Pedido cancelado")
  assert.equal(module.ADMIN_NOTIFICATION_TYPE_LABELS.refunded, "Reembolso concluído")
  assert.equal(module.ADMIN_NOTIFICATION_TYPE_LABELS.charged_back, "Pagamento revertido")
})
