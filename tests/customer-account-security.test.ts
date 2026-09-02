import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import type { CustomerIdentity } from "../lib/server/customer-auth.ts"
import {
  getOwnOrderByIdWithDependencies,
  listOwnOrdersWithDependencies,
  type CustomerOrderDependencies,
} from "../lib/server/customer-orders.ts"
import {
  claimGuestOrderWithDependencies,
  parseClaimGuestOrderInput,
} from "../lib/server/customer-order-claim.ts"
import { authorizeAdminAccessWithDependencies } from "../lib/server/admin-auth.ts"

const A_ID = "11111111-1111-4111-8111-111111111111"
const B_ID = "22222222-2222-4222-8222-222222222222"
const A_ORDER = "550e8400-e29b-41d4-a716-446655440000"
const B_ORDER = "660e8400-e29b-41d4-a716-446655440001"
const MISSING_ORDER = "770e8400-e29b-41d4-a716-446655440002"
const SESSION_ID = "33333333-3333-4333-8333-333333333333"
const TOKEN = "a1".repeat(32)
const CREATED_AT = "2026-09-02T12:00:00.000Z"

const CUSTOMER_A: CustomerIdentity = {
  userId: A_ID,
  email: "cliente-a@example.com",
  emailVerified: true,
}

function summary(id: string, orderNumber: string) {
  return {
    id,
    order_number: orderNumber,
    subtotal_cents: 11990,
    total_cents: 13490,
    payment_status: "approved",
    fulfillment_status: "awaiting_production",
    created_at: CREATED_AT,
    shipping_service_name: "PAC",
    shipping_carrier_name: "Correios",
    shipping_delivery_days: 5,
  }
}

function detail(id: string, orderNumber: string, customerEmail: string) {
  return {
    id,
    order_number: orderNumber,
    items: [
      {
        productId: 1,
        title: "Deck Commander Proxy 100 Cartas",
        unitPriceCents: 11990,
        quantity: 1,
        shipping: {
          weightKg: 0.25,
          lengthCm: 20,
          widthCm: 15,
          heightCm: 2,
        },
      },
    ],
    subtotal_cents: 11990,
    shipping_cents: 1500,
    total_cents: 13490,
    payment_status: "approved",
    fulfillment_status: "awaiting_production",
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    shipping_service_name: "PAC",
    shipping_carrier_name: "Correios",
    shipping_delivery_days: 5,
    customer_name: "Cliente",
    whatsapp: "44999999999",
    customer_email: customerEmail,
    address_street: "Rua Teste",
    address_number: "123",
    address_complement: null,
    address_neighborhood: "Centro",
    address_city: "Maringá",
    address_state: "PR",
    timeline: [{ kind: "payment_approved", created_at: CREATED_AT }],
  }
}

function sessionDependencies(owner: "A" | "B"): CustomerOrderDependencies {
  const ownId = owner === "A" ? A_ORDER : B_ORDER
  const ownNumber = owner === "A" ? "PB-A1B2C3D4E5F6" : "PB-B1C2D3E4F5A6"
  const ownEmail = owner === "A" ? CUSTOMER_A.email : "cliente-b@example.com"
  return {
    async listOrders() {
      return { orders: [summary(ownId, ownNumber)], total: 1 }
    },
    async getOrder(orderId) {
      return orderId === ownId ? detail(ownId, ownNumber, ownEmail) : null
    },
  }
}

function sqlFunction(sql: string, name: string, nextName: string) {
  const start = sql.indexOf(`function public.${name}`)
  const end = sql.indexOf(`function public.${nextName}`, start + 1)
  assert.ok(start >= 0, `missing SQL function ${name}`)
  assert.ok(end > start, `missing SQL boundary after ${name}`)
  return sql.slice(start, end)
}

function collectKeys(value: unknown, keys = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys)
    return keys
  }
  if (!value || typeof value !== "object") return keys
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    keys.add(key)
    collectKeys(child, keys)
  }
  return keys
}

test("customer A repository session cannot list or retrieve customer B order", async () => {
  const a = sessionDependencies("A")
  const result = await listOwnOrdersWithDependencies(undefined, a)

  assert.deepEqual(result.orders.map((order) => order.id), [A_ORDER])
  assert.equal(await getOwnOrderByIdWithDependencies(B_ORDER, a), null)
  assert.equal((await getOwnOrderByIdWithDependencies(A_ORDER, a))?.id, A_ORDER)
})

test("missing and other-owned order UUIDs have the same null behavior", async () => {
  const a = sessionDependencies("A")
  const missing = await getOwnOrderByIdWithDependencies(MISSING_ORDER, a)
  const otherOwned = await getOwnOrderByIdWithDependencies(B_ORDER, a)

  assert.equal(missing, null)
  assert.equal(otherOwned, null)
  assert.deepEqual(missing, otherOwned)
})

test("customer read SQL derives ownership only from auth.uid and accepts no customer UUID", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/202609020003_customer_accounts_orders.sql", import.meta.url),
    "utf8",
  )
  const listSql = sqlFunction(sql, "customer_list_orders", "customer_get_order")
  const detailSql = sqlFunction(sql, "customer_get_order", "claim_guest_order_for_customer")

  for (const section of [listSql, detailSql]) {
    assert.match(section, /auth\.uid\(\)/)
    assert.match(section, /customer_id\s*=\s*auth\.uid\(\)/)
    assert.doesNotMatch(section, /p_customer_id/)
  }
})

test("public token tracking remains independent from customer ownership", async () => {
  const source = await readFile(
    new URL("../lib/server/orders.ts", import.meta.url),
    "utf8",
  )
  const start = source.indexOf("export async function getOrderByPublicToken")
  const end = source.indexOf("function isNullableString", start)
  assert.ok(start >= 0 && end > start)
  const section = source.slice(start, end)

  assert.match(section, /public_token/)
  assert.doesNotMatch(section, /customer_id\s*:/)
  assert.doesNotMatch(section, /auth\.uid|requireCustomerPageAccess|getOptionalCustomerIdentity/)
})

test("valid token plus wrong verified email stays generically not claimable", async () => {
  const result = await claimGuestOrderWithDependencies(
    { publicToken: TOKEN, customer: CUSTOMER_A },
    {
      async claimOrder(input) {
        assert.equal(input.publicToken, TOKEN)
        assert.equal(input.verifiedEmail, CUSTOMER_A.email)
        return { outcome: "not_claimable" }
      },
    },
  )
  assert.deepEqual(result, { outcome: "not_claimable" })

  const sql = await readFile(
    new URL("../supabase/migrations/202609020003_customer_accounts_orders.sql", import.meta.url),
    "utf8",
  )
  const claimSql = sql.slice(sql.indexOf("function public.claim_guest_order_for_customer"))
  assert.match(claimSql, /v_order_email\s*<>\s*p_verified_email/)
  assert.match(claimSql, /jsonb_build_object\('outcome',\s*'not_claimable'\)/)
})

test("claim cannot run with only email or only token", async () => {
  assert.throws(() => parseClaimGuestOrderInput({}))
  assert.throws(() =>
    parseClaimGuestOrderInput({ email: CUSTOMER_A.email }),
  )

  let calls = 0
  await assert.rejects(() =>
    claimGuestOrderWithDependencies(
      {
        publicToken: TOKEN,
        customer: { ...CUSTOMER_A, emailVerified: false },
      },
      {
        async claimOrder() {
          calls += 1
          return { outcome: "not_claimable" }
        },
      },
    ),
  )
  assert.equal(calls, 0)
})

test("ordinary customer session cannot satisfy the independent admin boundary", async () => {
  let authorizeCalls = 0
  let signOutCalls = 0
  const base = {
    adminUserId: B_ID,
    nowSeconds: () => 1_700_000_100,
    getClaims: async () => ({
      sub: A_ID,
      session_id: SESSION_ID,
      aal: "aal2",
      is_anonymous: false,
      amr: [
        { method: "password", timestamp: 1_700_000_000 },
        { method: "totp", timestamp: 1_700_000_050 },
      ],
    }),
    signOut: async () => { signOutCalls += 1 },
    authorizeSession: async () => {
      authorizeCalls += 1
      return "active" as const
    },
    activateSession: async () => null,
    revokeSession: async () => false,
  }

  assert.deepEqual(await authorizeAdminAccessWithDependencies(base), {
    ok: false,
    reason: "not_admin",
  })
  assert.equal(authorizeCalls, 0)
  assert.equal(signOutCalls, 1)

  const ownerAal1 = {
    ...base,
    adminUserId: A_ID,
    getClaims: async () => ({
      sub: A_ID,
      session_id: SESSION_ID,
      aal: "aal1",
      is_anonymous: false,
      amr: [{ method: "password", timestamp: 1_700_000_000 }],
    }),
  }
  assert.deepEqual(await authorizeAdminAccessWithDependencies(ownerAal1), {
    ok: false,
    reason: "mfa_required",
  })

  const ownerNoAppSession = {
    ...base,
    adminUserId: A_ID,
    authorizeSession: async () => "missing" as const,
  }
  assert.deepEqual(await authorizeAdminAccessWithDependencies(ownerNoAppSession), {
    ok: false,
    reason: "session_missing",
  })
})

test("customer DTOs remain free of every forbidden internal field", async () => {
  const list = await listOwnOrdersWithDependencies(undefined, sessionDependencies("A"))
  const detailResult = await getOwnOrderByIdWithDependencies(A_ORDER, sessionDependencies("A"))
  assert.ok(detailResult)

  const keys = collectKeys({ list, detail: detailResult })
  for (const forbidden of [
    "public_token",
    "checkout_attempt_id",
    "checkout_fingerprint",
    "checkout_url",
    "shipping_snapshot",
    "admin_audit",
    "payment_id",
    "preference_id",
  ]) {
    assert.equal(keys.has(forbidden), false, forbidden)
  }
})
