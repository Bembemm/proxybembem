import assert from "node:assert/strict"
import test from "node:test"

const WORKER_ID = "11111111-1111-4111-8111-111111111111"
const NOTIFICATION_ID = "22222222-2222-4222-8222-222222222222"
const ORDER_ID = "33333333-3333-4333-8333-333333333333"

async function withSupabaseEnv<T>(fn: () => Promise<T>) {
  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SECRET_KEY
  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "service-role-secret"
  try {
    return await fn()
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY
    else process.env.SUPABASE_SECRET_KEY = previousKey
  }
}

test("claimDueNotifications uses service-role RPC with bounded no-store request and strict result mapping", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await import("../lib/server/notification-outbox.ts")
    let calls = 0
    t.mock.method(globalThis, "fetch", async (input, init) => {
      calls += 1
      assert.equal(String(input), "https://example.supabase.co/rest/v1/rpc/claim_due_notification_outbox")
      assert.equal(init?.method, "POST")
      assert.equal(init?.cache, "no-store")
      const headers = new Headers(init?.headers)
      assert.equal(headers.get("apikey"), "service-role-secret")
      assert.equal(headers.get("content-type"), "application/json")
      assert.deepEqual(JSON.parse(String(init?.body)), {
        p_limit: 25,
        p_worker_id: WORKER_ID,
        p_lease_seconds: 120,
      })
      assert.ok(init?.signal, "database request must use a bounded timeout signal")
      return Response.json([
        {
          id: NOTIFICATION_ID,
          order_id: ORDER_ID,
          notification_type: "payment_approved",
          recipient_email: "cliente@example.com",
          template_payload: { version: 1, type: "payment_approved" },
          provider_idempotency_key: "notification:stable-key",
          attempt_count: 0,
        },
      ])
    })

    const rows = await module.claimDueNotifications({ workerId: WORKER_ID, limit: 25 })
    assert.equal(calls, 1)
    assert.deepEqual(rows, [
      {
        id: NOTIFICATION_ID,
        orderId: ORDER_ID,
        notificationType: "payment_approved",
        recipientEmail: "cliente@example.com",
        templatePayload: { version: 1, type: "payment_approved" },
        providerIdempotencyKey: "notification:stable-key",
        attemptCount: 0,
      },
    ])
  })
})

test("claimDueNotifications rejects malformed provider rows instead of passing unsafe values to the worker", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await import("../lib/server/notification-outbox.ts")
    t.mock.method(globalThis, "fetch", async () => Response.json([
      {
        id: NOTIFICATION_ID,
        order_id: ORDER_ID,
        notification_type: "opened",
        recipient_email: "cliente@example.com",
        template_payload: {},
        provider_idempotency_key: "key",
        attempt_count: 0,
      },
    ]))

    await assert.rejects(
      module.claimDueNotifications({ workerId: WORKER_ID, limit: 25 }),
      /Notification outbox request failed/,
    )
  })
})

test("claimDueNotifications enforces worker UUID and maximum batch size before network access", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await import("../lib/server/notification-outbox.ts")
    let calls = 0
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1
      return Response.json([])
    })

    await assert.rejects(module.claimDueNotifications({ workerId: "bad", limit: 25 }))
    await assert.rejects(module.claimDueNotifications({ workerId: WORKER_ID, limit: 26 }))
    await assert.rejects(module.claimDueNotifications({ workerId: WORKER_ID, limit: 0 }))
    assert.equal(calls, 0)
  })
})

test("completeNotificationAttempt maps accepted and retryable outcomes to the completion RPC without leaking provider data", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await import("../lib/server/notification-outbox.ts")
    const bodies: unknown[] = []
    t.mock.method(globalThis, "fetch", async (input, init) => {
      assert.equal(String(input), "https://example.supabase.co/rest/v1/rpc/complete_notification_attempt")
      bodies.push(JSON.parse(String(init?.body)))
      return Response.json({
        outcome: "recorded",
        notification_id: NOTIFICATION_ID,
        status: bodies.length === 1 ? "sent" : "retry_scheduled",
        attempt_count: bodies.length,
      })
    })

    const accepted = await module.completeNotificationAttempt({
      notificationId: NOTIFICATION_ID,
      workerId: WORKER_ID,
      outcome: "accepted",
      providerMessageId: "resend-message-id",
    })
    const retryable = await module.completeNotificationAttempt({
      notificationId: NOTIFICATION_ID,
      workerId: WORKER_ID,
      outcome: "retryable",
      errorCode: "provider_timeout",
    })

    assert.deepEqual(bodies, [
      {
        p_notification_id: NOTIFICATION_ID,
        p_worker_id: WORKER_ID,
        p_outcome: "accepted",
        p_provider_message_id: "resend-message-id",
        p_error_code: null,
      },
      {
        p_notification_id: NOTIFICATION_ID,
        p_worker_id: WORKER_ID,
        p_outcome: "retryable",
        p_provider_message_id: null,
        p_error_code: "provider_timeout",
      },
    ])
    assert.deepEqual(accepted, {
      outcome: "recorded",
      notificationId: NOTIFICATION_ID,
      status: "sent",
      attemptCount: 1,
    })
    assert.deepEqual(retryable, {
      outcome: "recorded",
      notificationId: NOTIFICATION_ID,
      status: "retry_scheduled",
      attemptCount: 2,
    })
  })
})
