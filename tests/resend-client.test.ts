import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { sendResendEmail } from "../lib/server/resend-client.ts"

const API_KEY = "re_test_phase6_secret"

function withResendApiKey<T>(run: () => T): T {
  const previous = process.env.RESEND_API_KEY
  process.env.RESEND_API_KEY = API_KEY
  try {
    return run()
  } finally {
    if (previous === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = previous
  }
}

async function withFetch<T>(
  implementation: typeof fetch,
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch
  globalThis.fetch = implementation
  try {
    return await run()
  } finally {
    globalThis.fetch = original
  }
}

function success(id = "2f56f2b1-5317-4d70-9dbf-a86e09c1450a") {
  return new Response(JSON.stringify({ id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

test("posts one bounded HTML+text email to Resend with the fixed sender and optional idempotency key", async () => {
  let seenUrl = ""
  let seenInit: RequestInit | undefined

  await withFetch(
    (async (input, init) => {
      seenUrl = String(input)
      seenInit = init
      return success()
    }) as typeof fetch,
    async () =>
      withResendApiKey(async () => {
        const result = await sendResendEmail({
          to: "cliente@example.com",
          subject: "Pedido aprovado",
          text: "Texto puro",
          html: "<p>HTML</p>",
          idempotencyKey: "notification-row-123",
        })

        assert.deepEqual(result, {
          outcome: "accepted",
          messageId: "2f56f2b1-5317-4d70-9dbf-a86e09c1450a",
        })
      }),
  )

  assert.equal(seenUrl, "https://api.resend.com/emails")
  assert.equal(seenInit?.method, "POST")
  const headers = new Headers(seenInit?.headers)
  assert.equal(headers.get("authorization"), `Bearer ${API_KEY}`)
  assert.equal(headers.get("content-type"), "application/json")
  assert.equal(headers.get("idempotency-key"), "notification-row-123")
  assert.ok(seenInit?.signal instanceof AbortSignal)

  const body = JSON.parse(String(seenInit?.body))
  assert.deepEqual(body, {
    from: "ProxyBembem <noreply@proxybembem.com.br>",
    to: ["cliente@example.com"],
    subject: "Pedido aprovado",
    text: "Texto puro",
    html: "<p>HTML</p>",
  })
})

test("omits Idempotency-Key when the caller does not supply one", async () => {
  let seenHeaders = new Headers()

  await withFetch(
    (async (_input, init) => {
      seenHeaders = new Headers(init?.headers)
      return success("msg_recovery_123")
    }) as typeof fetch,
    async () =>
      withResendApiKey(async () => {
        const result = await sendResendEmail({
          to: "cliente@example.com",
          subject: "Recuperação",
          text: "Texto",
          html: "<p>Texto</p>",
        })
        assert.deepEqual(result, {
          outcome: "accepted",
          messageId: "msg_recovery_123",
        })
      }),
  )

  assert.equal(seenHeaders.has("idempotency-key"), false)
})

test("classifies provider and transport failures without leaking response bodies", async () => {
  const cases: Array<{
    name: string
    fetchImpl: typeof fetch
    expected: { outcome: "retryable" | "rejected"; code: string }
  }> = [
    {
      name: "rate limited",
      fetchImpl: (async () =>
        new Response('{"message":"raw-secret-rate-limit"}', {
          status: 429,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch,
      expected: { outcome: "retryable", code: "provider_rate_limited" },
    },
    {
      name: "provider unavailable",
      fetchImpl: (async () =>
        new Response("raw-secret-provider-body", { status: 503 })) as typeof fetch,
      expected: { outcome: "retryable", code: "provider_unavailable" },
    },
    {
      name: "definite provider rejection",
      fetchImpl: (async () =>
        new Response("raw-secret-invalid-recipient", { status: 422 })) as typeof fetch,
      expected: { outcome: "rejected", code: "provider_rejected" },
    },
    {
      name: "network failure",
      fetchImpl: (async () => {
        throw new Error("raw-secret-network-error")
      }) as typeof fetch,
      expected: { outcome: "retryable", code: "provider_network" },
    },
    {
      name: "timeout",
      fetchImpl: (async () => {
        throw new DOMException("raw-secret-timeout", "AbortError")
      }) as typeof fetch,
      expected: { outcome: "retryable", code: "provider_timeout" },
    },
  ]

  for (const item of cases) {
    await withFetch(item.fetchImpl, async () =>
      withResendApiKey(async () => {
        const result = await sendResendEmail({
          to: "cliente@example.com",
          subject: item.name,
          text: "Texto",
          html: "<p>Texto</p>",
        })
        assert.deepEqual(result, item.expected)
        assert.doesNotMatch(JSON.stringify(result), /raw-secret/i)
      }),
    )
  }
})

test("treats malformed successful responses as uncertain and bounded", async () => {
  for (const response of [
    new Response("not-json", { status: 200 }),
    new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify({ id: "x".repeat(129) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ]) {
    await withFetch(
      (async () => response.clone()) as typeof fetch,
      async () =>
        withResendApiKey(async () => {
          assert.deepEqual(
            await sendResendEmail({
              to: "cliente@example.com",
              subject: "Teste",
              text: "Texto",
              html: "<p>Texto</p>",
            }),
            { outcome: "retryable", code: "provider_invalid_response" },
          )
        }),
    )
  }
})

test("fails closed on missing provider configuration before fetch", async () => {
  const previous = process.env.RESEND_API_KEY
  delete process.env.RESEND_API_KEY
  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    calls += 1
    return success()
  }) as typeof fetch

  try {
    await assert.rejects(
      sendResendEmail({
        to: "cliente@example.com",
        subject: "Teste",
        text: "Texto",
        html: "<p>Texto</p>",
      }),
      /Missing transactional email provider configuration/,
    )
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = original
    if (previous === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = previous
  }
})

test("source keeps provider timeout bounded to ten seconds and never logs raw provider material", async () => {
  const source = await readFile(
    new URL("../lib/server/resend-client.ts", import.meta.url),
    "utf8",
  ).catch(() => "")

  assert.match(source, /PROVIDER_TIMEOUT_MS\s*=\s*10_000/)
  assert.match(source, /AbortSignal\.timeout\(PROVIDER_TIMEOUT_MS\)/)
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/)
  assert.doesNotMatch(source, /response\.text\s*\(/)
})
