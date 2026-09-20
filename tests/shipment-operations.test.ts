import assert from "node:assert/strict"
import test from "node:test"

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const
const SHIPMENT_ID = "11111111-1111-4111-8111-111111111111"
const ORDER_ID = "22222222-2222-4222-8222-222222222222"
const ADMIN_ID = "33333333-3333-4333-8333-333333333333"
const SENDER_ID = "44444444-4444-4444-8444-444444444444"
const OPERATION_ID = "55555555-5555-4555-8555-555555555555"
const PROVIDER_ID = "6e1c864a-fe48-4ae7-baaa-d6e4888bafd1"

type ShipmentState =
  | "draft"
  | "prepared"
  | "in_cart"
  | "purchase_pending"
  | "purchased"
  | "generation_pending"
  | "generated"
  | "posted"
  | "in_transit"
  | "delivered"
  | "cancel_pending"
  | "canceled"
  | "attention_required"

type Outcome =
  | "created"
  | "transitioned"
  | "not_found"
  | "conflict"
  | "invalid_state"
  | "operation_mismatch"
  | "active_exists"

type OperationResult = {
  outcome: Outcome
  shipmentId: string | null
  orderId: string | null
  previousState: ShipmentState | null
  state: ShipmentState | null
  version: number | null
}

type Module = {
  createShipmentDraft(input: Record<string, unknown>): Promise<OperationResult>
  claimShipmentPrepare(input: Record<string, unknown>): Promise<OperationResult>
  commitShipmentCart(input: Record<string, unknown>): Promise<OperationResult>
  revertShipmentPrepare(input: Record<string, unknown>): Promise<OperationResult>
  markShipmentAttention(input: Record<string, unknown>): Promise<OperationResult>
}

async function loadModule(): Promise<Module> {
  const path = "../lib/server/shipment-operations.ts"
  const module = (await import(path)) as Record<string, unknown>
  for (const name of [
    "createShipmentDraft",
    "claimShipmentPrepare",
    "commitShipmentCart",
    "revertShipmentPrepare",
    "markShipmentAttention",
  ]) {
    assert.equal(typeof module[name], "function", `missing export ${name}`)
  }

  for (const retired of [
    "claimShipmentPurchase",
    "commitShipmentPurchase",
    "revertShipmentPurchase",
    "resolveShipmentReconciliation",
    "claimShipmentGeneration",
    "commitShipmentGeneration",
    "claimShipmentCancel",
    "commitShipmentCancel",
    "confirmShipmentPosting",
    "applyShipmentTrackingUpdate",
  ]) {
    assert.equal(module[retired], undefined, `retired export ${retired} must stay absent`)
  }

  return module as unknown as Module
}

async function withSupabaseEnv(run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) previous.set(key, process.env[key])
  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "server-secret"

  try {
    await run()
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function rpcResult(overrides: Record<string, unknown> = {}) {
  return {
    outcome: "transitioned",
    shipment_id: SHIPMENT_ID,
    order_id: ORDER_ID,
    previous_state: "prepared",
    state: "in_cart",
    version: 3,
    ...overrides,
  }
}

function commonMutation() {
  return {
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedVersion: 2,
    operationId: OPERATION_ID,
  }
}

function assertRpcRequest(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] | undefined,
  rpc: string,
  body: Record<string, unknown>,
) {
  assert.equal(String(input), `https://example.supabase.co/rest/v1/rpc/${rpc}`)
  assert.equal(init?.method, "POST")
  assert.equal((init?.headers as Record<string, string>)?.apikey, "server-secret")
  assert.equal(init?.cache, "no-store")
  assert.ok(init?.signal instanceof AbortSignal)
  assert.deepEqual(JSON.parse(String(init?.body)), body)
}

test("prepare-only shipment operations expose no provider purchase or label lifecycle actions", async () => {
  await loadModule()
})

test("create draft sends only trusted shipment snapshot inputs", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await loadModule()
    const input = {
      orderId: ORDER_ID,
      adminUserId: ADMIN_ID,
      senderProfileId: SENDER_ID,
      senderProfileVersion: 2,
      environment: "sandbox",
      serviceId: "3",
      serviceName: ".Package",
      carrierName: "Jadlog",
      customerShippingCents: 1990,
      recipientSnapshot: { name: "Cliente", postalCode: "01001000" },
      senderSnapshot: { fullName: "Breno Bembem", postalCode: "86730000" },
      packageSnapshot: { height: 4, width: 19, length: 25, weight: 0.25 },
      declarationItemsSnapshot: [
        { productId: 1, description: "Proxy MTG", quantity: 1, unitValueCents: 11990 },
      ],
    }

    t.mock.method(
      globalThis,
      "fetch",
      async (request: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        assertRpcRequest(request, init, "admin_create_shipment_draft", {
          p_order_id: ORDER_ID,
          p_admin_user_id: ADMIN_ID,
          p_sender_profile_id: SENDER_ID,
          p_sender_profile_version: 2,
          p_environment: "sandbox",
          p_service_id: "3",
          p_service_name: ".Package",
          p_carrier_name: "Jadlog",
          p_customer_shipping_cents: 1990,
          p_recipient_snapshot: input.recipientSnapshot,
          p_sender_snapshot: input.senderSnapshot,
          p_package_snapshot: input.packageSnapshot,
          p_declaration_items_snapshot: input.declarationItemsSnapshot,
        })
        return Response.json({
          outcome: "created",
          shipment_id: SHIPMENT_ID,
          order_id: ORDER_ID,
          previous_state: null,
          state: "draft",
          version: 1,
        })
      },
    )

    const result = await module.createShipmentDraft(input)
    assert.equal(result.outcome, "created")
    assert.equal(result.state, "draft")
    assert.equal(result.version, 1)
  })
})

test("prepare claim commit revert and attention use only preparation RPCs", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await loadModule()
    const calls = [
      {
        fn: module.claimShipmentPrepare,
        rpc: "admin_claim_shipment_prepare",
        input: commonMutation(),
        body: {
          p_shipment_id: SHIPMENT_ID,
          p_admin_user_id: ADMIN_ID,
          p_expected_version: 2,
          p_operation_id: OPERATION_ID,
        },
      },
      {
        fn: module.commitShipmentCart,
        rpc: "admin_commit_shipment_cart",
        input: {
          ...commonMutation(),
          providerCartId: PROVIDER_ID,
          providerShipmentId: PROVIDER_ID,
          providerCostCents: 1842,
        },
        body: {
          p_shipment_id: SHIPMENT_ID,
          p_admin_user_id: ADMIN_ID,
          p_expected_version: 2,
          p_operation_id: OPERATION_ID,
          p_provider_cart_id: PROVIDER_ID,
          p_provider_shipment_id: PROVIDER_ID,
          p_provider_cost_cents: 1842,
        },
      },
      {
        fn: module.revertShipmentPrepare,
        rpc: "admin_revert_shipment_prepare",
        input: commonMutation(),
        body: {
          p_shipment_id: SHIPMENT_ID,
          p_admin_user_id: ADMIN_ID,
          p_expected_version: 2,
          p_operation_id: OPERATION_ID,
        },
      },
      {
        fn: module.markShipmentAttention,
        rpc: "admin_mark_shipment_attention",
        input: { ...commonMutation(), reason: "cart_outcome_unknown" },
        body: {
          p_shipment_id: SHIPMENT_ID,
          p_admin_user_id: ADMIN_ID,
          p_expected_version: 2,
          p_operation_id: OPERATION_ID,
          p_reason: "cart_outcome_unknown",
        },
      },
    ]

    let index = 0
    t.mock.method(
      globalThis,
      "fetch",
      async (request: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const item = calls[index++]
        assertRpcRequest(request, init, item.rpc, item.body)
        return Response.json(rpcResult())
      },
    )

    for (const item of calls) await item.fn(item.input)
    assert.equal(index, calls.length)
  })
})

test("retired attention reasons and malformed preparation inputs fail before storage", async (t) => {
  const module = await loadModule()
  let calls = 0
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1
    return Response.json(rpcResult())
  })

  await assert.rejects(() =>
    module.claimShipmentPrepare({ ...commonMutation(), shipmentId: "bad-id" }),
  )
  await assert.rejects(() =>
    module.markShipmentAttention({
      ...commonMutation(),
      reason: "purchase_outcome_unknown",
    }),
  )
  await assert.rejects(() =>
    module.commitShipmentCart({
      ...commonMutation(),
      providerCartId: PROVIDER_ID,
      providerShipmentId: PROVIDER_ID,
      providerCostCents: -1,
    }),
  )

  assert.equal(calls, 0)
})

test("malformed RPC responses and storage failures remain generic", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await loadModule()
    const responses: Array<unknown | "network" | "storage"> = [
      {},
      rpcResult({ outcome: "invented" }),
      rpcResult({ shipment_id: "bad-id" }),
      rpcResult({ state: "invented" }),
      rpcResult({ version: 0 }),
      "storage",
      "network",
    ]
    let index = 0

    t.mock.method(globalThis, "fetch", async () => {
      const value = responses[index++]
      if (value === "network") throw new Error("network secret detail")
      if (value === "storage") {
        return Response.json({ message: "database secret detail" }, { status: 500 })
      }
      return Response.json(value)
    })

    for (const _value of responses) {
      await assert.rejects(
        () => module.claimShipmentPrepare(commonMutation()),
        (error: unknown) =>
          error instanceof Error &&
          error.message === "Shipment operation failed" &&
          !error.message.includes("secret"),
      )
    }
  })
})
