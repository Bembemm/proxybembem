import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import test from "node:test"

const WEBHOOK_SECRET = `whsec_${Buffer.from("test-webhook-signing-material-32-bytes").toString("base64")}`
const NOW_SECONDS = 1_800_000_000
const MESSAGE_ID = "msg_test_123"
const EMAIL_ID = "email_test_456"

function signature(rawBody: string, id = MESSAGE_ID, timestamp = NOW_SECONDS) {
  const key = Buffer.from(WEBHOOK_SECRET.slice("whsec_".length), "base64")
  const digest = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64")
  return `v1,${digest}`
}

async function loadWebhook() {
  return import("../lib/server/resend-webhook.ts")
}

test("verifyResendWebhook accepts a valid Svix v1 signature over the raw body", async () => {
  const module = await loadWebhook()
  const rawBody = JSON.stringify({ type: "email.delivered", data: { email_id: EMAIL_ID } })
  assert.equal(module.verifyResendWebhook({
    rawBody,
    id: MESSAGE_ID,
    timestamp: String(NOW_SECONDS),
    signature: signature(rawBody),
    secret: WEBHOOK_SECRET,
    now: NOW_SECONDS,
  }), true)
})

test("verifyResendWebhook rejects changed body id signature and stale timestamps", async () => {
  const module = await loadWebhook()
  const rawBody = JSON.stringify({ type: "email.delivered", data: { email_id: EMAIL_ID } })
  const signed = signature(rawBody)

  assert.equal(module.verifyResendWebhook({
    rawBody: `${rawBody} `,
    id: MESSAGE_ID,
    timestamp: String(NOW_SECONDS),
    signature: signed,
    secret: WEBHOOK_SECRET,
    now: NOW_SECONDS,
  }), false)
  assert.equal(module.verifyResendWebhook({
    rawBody,
    id: "different-id",
    timestamp: String(NOW_SECONDS),
    signature: signed,
    secret: WEBHOOK_SECRET,
    now: NOW_SECONDS,
  }), false)
  assert.equal(module.verifyResendWebhook({
    rawBody,
    id: MESSAGE_ID,
    timestamp: String(NOW_SECONDS - 301),
    signature: signature(rawBody, MESSAGE_ID, NOW_SECONDS - 301),
    secret: WEBHOOK_SECRET,
    now: NOW_SECONDS,
  }), false)
  assert.equal(module.verifyResendWebhook({
    rawBody,
    id: MESSAGE_ID,
    timestamp: String(NOW_SECONDS),
    signature: "v1,invalid",
    secret: WEBHOOK_SECRET,
    now: NOW_SECONDS,
  }), false)
})

test("handler records only approved operational events by trusted email_id", async () => {
  const module = await loadWebhook()
  const calls: unknown[] = []
  const rawBody = JSON.stringify({
    type: "email.bounced",
    created_at: "2026-09-12T23:00:00.000Z",
    data: { email_id: EMAIL_ID, to: ["ignored@example.com"] },
  })
  const handler = module.createResendWebhookHandler({
    getSecret: () => WEBHOOK_SECRET,
    now: () => NOW_SECONDS,
    record: async (input) => {
      calls.push(input)
      return { outcome: "recorded" as const, matched: true, status: "bounced" as const }
    },
  })

  const response = await handler(new Request("https://www.proxybembem.com.br/api/webhooks/resend", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": MESSAGE_ID,
      "svix-timestamp": String(NOW_SECONDS),
      "svix-signature": signature(rawBody),
    },
    body: rawBody,
  }))

  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert.deepEqual(await response.json(), { ok: true })
  assert.deepEqual(calls, [{
    svixId: MESSAGE_ID,
    eventType: "email.bounced",
    providerMessageId: EMAIL_ID,
  }])
})

test("handler ignores opened clicked and unknown events without recording business state", async () => {
  const module = await loadWebhook()
  let recordCalls = 0
  const handler = module.createResendWebhookHandler({
    getSecret: () => WEBHOOK_SECRET,
    now: () => NOW_SECONDS,
    record: async () => {
      recordCalls += 1
      return { outcome: "recorded" as const, matched: false, status: null }
    },
  })

  for (const type of ["email.opened", "email.clicked", "contact.updated"]) {
    const rawBody = JSON.stringify({ type, data: { email_id: EMAIL_ID } })
    const response = await handler(new Request("https://www.proxybembem.com.br/api/webhooks/resend", {
      method: "POST",
      headers: {
        "svix-id": `${MESSAGE_ID}-${type}`,
        "svix-timestamp": String(NOW_SECONDS),
        "svix-signature": signature(rawBody, `${MESSAGE_ID}-${type}`),
      },
      body: rawBody,
    }))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
  }
  assert.equal(recordCalls, 0)
})

test("handler rejects invalid or missing signatures before parsing/recording", async () => {
  const module = await loadWebhook()
  let recordCalls = 0
  const handler = module.createResendWebhookHandler({
    getSecret: () => WEBHOOK_SECRET,
    now: () => NOW_SECONDS,
    record: async () => {
      recordCalls += 1
      return { outcome: "recorded" as const, matched: false, status: null }
    },
  })
  const rawBody = "not-even-json"
  const headerVariants: HeadersInit[] = [
    {},
    {
      "svix-id": MESSAGE_ID,
      "svix-timestamp": String(NOW_SECONDS),
      "svix-signature": "v1,wrong",
    },
  ]

  for (const headers of headerVariants) {
    const response = await handler(new Request("https://www.proxybembem.com.br/api/webhooks/resend", {
      method: "POST",
      headers,
      body: rawBody,
    }))
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { ok: false })
  }
  assert.equal(recordCalls, 0)
})

test("duplicate/replayed svix-id is accepted idempotently and does not expose provider details", async () => {
  const module = await loadWebhook()
  const rawBody = JSON.stringify({ type: "email.delivered", data: { email_id: EMAIL_ID } })
  const handler = module.createResendWebhookHandler({
    getSecret: () => WEBHOOK_SECRET,
    now: () => NOW_SECONDS,
    record: async () => ({ outcome: "duplicate" as const, matched: false, status: null }),
  })
  const response = await handler(new Request("https://www.proxybembem.com.br/api/webhooks/resend", {
    method: "POST",
    headers: {
      "svix-id": MESSAGE_ID,
      "svix-timestamp": String(NOW_SECONDS),
      "svix-signature": signature(rawBody),
    },
    body: rawBody,
  }))
  assert.equal(response.status, 200)
  assert.equal(await response.text(), JSON.stringify({ ok: true }))
})
