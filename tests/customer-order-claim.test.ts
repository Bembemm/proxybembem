import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import type { CustomerIdentity } from "../lib/server/customer-auth.ts"

const ORDER_ID = "550e8400-e29b-41d4-a716-446655440000"
const TOKEN = "A1".repeat(32)
const CUSTOMER: CustomerIdentity = {
  userId: "7f3f1d7a-834e-4f45-8f74-fad0cd2c8e3d",
  email: "cliente@example.com",
  emailVerified: true,
}

async function claimModule() {
  return import("../lib/server/customer-order-claim.ts")
}

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "")
}

test("claim input accepts only one canonical 64-character public token", async () => {
  const claim = await claimModule()

  assert.deepEqual(claim.parseClaimGuestOrderInput({ publicToken: ` ${TOKEN} ` }), {
    publicToken: TOKEN.toLowerCase(),
  })

  for (const invalid of [
    {},
    { publicToken: "abc" },
    { publicToken: "g".repeat(64) },
    { publicToken: "a".repeat(65) },
    { publicToken: TOKEN, email: "cliente@example.com" },
    { publicToken: TOKEN, customerId: CUSTOMER.userId },
  ]) {
    assert.throws(() => claim.parseClaimGuestOrderInput(invalid))
  }
})

test("claim requires a verified canonical trusted customer before storage", async () => {
  const claim = await claimModule()
  let calls = 0
  const deps = {
    async claimOrder() {
      calls += 1
      return { outcome: "not_claimable" }
    },
  }

  const invalidCustomers = [
    { ...CUSTOMER, emailVerified: false },
    { ...CUSTOMER, userId: "not-a-uuid" },
    { ...CUSTOMER, userId: "00000000-0000-0000-0000-000000000000" },
    { ...CUSTOMER, email: " Cliente@Example.COM " },
    { ...CUSTOMER, email: "invalid" },
  ]

  for (const customer of invalidCustomers) {
    await assert.rejects(() =>
      claim.claimGuestOrderWithDependencies(
        { publicToken: TOKEN, customer: customer as unknown as CustomerIdentity },
        deps,
      ),
    )
  }
  assert.equal(calls, 0)
})

test("service dependency receives only normalized token and trusted identity fields", async () => {
  const claim = await claimModule()
  const calls: unknown[] = []

  const result = await claim.claimGuestOrderWithDependencies(
    { publicToken: TOKEN, customer: CUSTOMER },
    {
      async claimOrder(input: unknown) {
        calls.push(input)
        return {
          outcome: "claimed",
          order_id: ORDER_ID,
          order_number: "PB-A1B2C3D4E5F6",
        }
      },
    },
  )

  assert.deepEqual(calls, [
    {
      publicToken: TOKEN.toLowerCase(),
      userId: CUSTOMER.userId,
      verifiedEmail: CUSTOMER.email,
    },
  ])
  assert.deepEqual(result, {
    outcome: "claimed",
    orderId: ORDER_ID,
    orderNumber: "PB-A1B2C3D4E5F6",
  })
})

test("claim parser keeps mismatch generic and repeated claim idempotent", async () => {
  const claim = await claimModule()

  for (const providerResult of [
    { outcome: "not_claimable" },
    { outcome: "not_claimable" },
  ]) {
    assert.deepEqual(
      await claim.claimGuestOrderWithDependencies(
        { publicToken: TOKEN, customer: CUSTOMER },
        { async claimOrder() { return providerResult } },
      ),
      { outcome: "not_claimable" },
    )
  }

  assert.deepEqual(
    await claim.claimGuestOrderWithDependencies(
      { publicToken: TOKEN, customer: CUSTOMER },
      {
        async claimOrder() {
          return {
            outcome: "already_claimed",
            order_id: ORDER_ID,
            order_number: "PB-A1B2C3D4E5F6",
          }
        },
      },
    ),
    {
      outcome: "already_claimed",
      orderId: ORDER_ID,
      orderNumber: "PB-A1B2C3D4E5F6",
    },
  )
})

test("claim rejects malformed or overbroad service responses", async () => {
  const claim = await claimModule()
  const malformed = [
    { outcome: "claimed", order_id: "bad", order_number: "PB-A1B2C3D4E5F6" },
    { outcome: "claimed", order_id: ORDER_ID, order_number: "bad" },
    { outcome: "already_claimed", order_id: ORDER_ID },
    { outcome: "not_claimable", order_id: ORDER_ID },
    { outcome: "email_mismatch" },
    { outcome: "not_claimable", email: CUSTOMER.email },
  ]

  for (const providerResult of malformed) {
    await assert.rejects(() =>
      claim.claimGuestOrderWithDependencies(
        { publicToken: TOKEN, customer: CUSTOMER },
        { async claimOrder() { return providerResult } },
      ),
    )
  }
})

test("production claim wrapper is service-role-only with exact RPC payload and bounded timeout", async () => {
  const moduleSource = await source("../lib/server/customer-order-claim.ts")

  assert.match(moduleSource, /getSupabaseEnv/)
  assert.match(moduleSource, /rpc\/claim_guest_order_for_customer/)
  assert.match(moduleSource, /p_public_token/)
  assert.match(moduleSource, /p_customer_id/)
  assert.match(moduleSource, /p_verified_email/)
  assert.match(moduleSource, /AbortSignal\.timeout\(10_000\)/)
  assert.match(moduleSource, /supabaseSecretKey/)
  assert.doesNotMatch(moduleSource, /createSupabaseServerClient|auth\.uid|auth\.getUser/)
  assert.doesNotMatch(
    moduleSource,
    /console\.(?:log|info|warn|error)\([^\n]*(?:publicToken|verifiedEmail|email|token)/i,
  )
  assert.doesNotMatch(moduleSource, /claimGuestOrderByEmail|claimOrderByEmail/)
})

test("claim route accepts only publicToken after same-origin rate limit and verified customer access", async () => {
  const route = await source("../app/api/account/orders/claim/route.ts")

  assert.ok(route.length > 0, "missing claim route")
  assert.match(route, /export\s+async\s+function\s+POST|export\s+const\s+POST/)
  assert.doesNotMatch(route, /export\s+(?:async\s+function|const)\s+GET/)
  assert.match(route, /isSameOriginAccountRequest/)
  assert.match(route, /consumeRateLimit/)
  assert.match(route, /scope:\s*["']account-claim["']/)
  assert.match(route, /requireCustomerPageAccess/)
  assert.match(route, /readJsonBody\s*\(\s*request\s*,\s*4_096\s*\)/)
  assert.match(route, /parseClaimGuestOrderInput/)
  assert.match(route, /claimGuestOrder/)
  assert.doesNotMatch(route, /customerId|customer_id|verifiedEmail|p_verified_email|p_customer_id/)
})

test("claim form submits only the token and never exposes customer identity", async () => {
  const form = await source("../components/account/order-claim-form.tsx")

  assert.ok(form.length > 0, "missing claim form")
  assert.match(form, /\/api\/account\/orders\/claim/)
  assert.match(form, /publicToken/)
  assert.match(form, /Adicionar à minha conta/)
  assert.doesNotMatch(form, /customerId|customer_id|verifiedEmail|customerEmail|emailVerified/)
})

test("public tracking preserves token display and offers claim only for claimable snapshots", async () => {
  const page = await source("../app/pedido/[token]/page.tsx")

  assert.match(page, /getOrderByPublicToken/)
  assert.match(page, /OrderStatus/)
  assert.match(page, /getOptionalCustomerIdentity/)
  assert.match(page, /OrderClaimForm/)
  assert.match(page, /order\.customer_email/)
  assert.match(page, /order\.customer_id/)
  assert.match(page, /\/entrar\?next=/)
  assert.match(page, /encodeURIComponent/)
  assert.doesNotMatch(page, /customer_email\s*===\s*identity\.email/)
})
