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
  claimShipmentPurchase(input: Record<string, unknown>): Promise<OperationResult>
  commitShipmentPurchase(input: Record<string, unknown>): Promise<OperationResult>
  revertShipmentPurchase(input: Record<string, unknown>): Promise<OperationResult>
  markShipmentAttention(input: Record<string, unknown>): Promise<OperationResult>
  resolveShipmentReconciliation(input: Record<string, unknown>): Promise<OperationResult>
  claimShipmentGeneration(input: Record<string, unknown>): Promise<OperationResult>
  commitShipmentGeneration(input: Record<string, unknown>): Promise<OperationResult>
  claimShipmentCancel(input: Record<string, unknown>): Promise<OperationResult>
  commitShipmentCancel(input: Record<string, unknown>): Promise<OperationResult>
  confirmShipmentPosting(input: Record<string, unknown>): Promise<OperationResult>
  applyShipmentTrackingUpdate(input: Record<string, unknown>): Promise<OperationResult>
}

async function loadModule(): Promise<Module> {
  const path = "../lib/server/shipment-operations.ts"
  const module = (await import(path)) as Record<string, unknown>
  for (const name of [
    "createShipmentDraft",
    "claimShipmentPrepare",
    "commitShipmentCart",
    "revertShipmentPrepare",
    "claimShipmentPurchase",
    "commitShipmentPurchase",
    "revertShipmentPurchase",
    "markShipmentAttention",
    "resolveShipmentReconciliation",
    "claimShipmentGeneration",
    "commitShipmentGeneration",
    "claimShipmentCancel",
    "commitShipmentCancel",
    "confirmShipmentPosting",
    "applyShipmentTrackingUpdate",
  ]) {
    assert.equal(typeof module[name], "function", `missing export ${name}`)
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

function expectedResult(overrides: Partial<OperationResult> = {}): OperationResult {
  return {
    outcome: "transitioned",
    shipmentId: SHIPMENT_ID,
    orderId: ORDER_ID,
    previousState: "prepared",
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

test("create draft sends only trusted shipment snapshot inputs and no browser-owned payment/customer state", async (t) => {
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
        return Response.json(
          rpcResult({
            outcome: "created",
            previous_state: null,
            state: "draft",
            version: 1,
          }),
        )
      },
    )

    assert.deepEqual(
      await module.createShipmentDraft(input),
      expectedResult({
        outcome: "created",
        previousState: null,
        state: "draft",
        version: 1,
      }),
    )
  })
})

test("prepare claim commit and revert use expected-version plus the exact operation UUID", async (t) => {
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
        result: rpcResult({ previous_state: "draft", state: "prepared", version: 3 }),
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
        result: rpcResult(),
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
        result: rpcResult({ previous_state: "prepared", state: "prepared" }),
      },
    ]
    let index = 0
    t.mock.method(
      globalThis,
      "fetch",
      async (request: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const item = calls[index++]
        assertRpcRequest(request, init, item.rpc, item.body)
        return Response.json(item.result)
      },
    )

    for (const item of calls) await item.fn(item.input)
    assert.equal(index, calls.length)
  })
})

test("purchase claim is durable and commit/revert cannot omit the operation UUID", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await loadModule()
    const calls = [
      {
        fn: module.claimShipmentPurchase,
        rpc: "admin_claim_shipment_purchase",
        input: commonMutation(),
        body: {
          p_shipment_id: SHIPMENT_ID,
          p_admin_user_id: ADMIN_ID,
          p_expected_version: 2,
          p_operation_id: OPERATION_ID,
        },
        result: rpcResult({ previous_state: "in_cart", state: "purchase_pending" }),
      },
      {
        fn: module.commitShipmentPurchase,
        rpc: "admin_commit_shipment_purchase",
        input: {
          ...commonMutation(),
          providerOrderId: PROVIDER_ID,
          purchasedCostCents: 1842,
        },
        body: {
          p_shipment_id: SHIPMENT_ID,
          p_admin_user_id: ADMIN_ID,
          p_expected_version: 2,
          p_operation_id: OPERATION_ID,
          p_provider_order_id: PROVIDER_ID,
          p_purchased_cost_cents: 1842,
        },
        result: rpcResult({ previous_state: "purchase_pending", state: "purchased" }),
      },
      {
        fn: module.revertShipmentPurchase,
        rpc: "admin_revert_shipment_purchase",
        input: commonMutation(),
        body: {
          p_shipment_id: SHIPMENT_ID,
          p_admin_user_id: ADMIN_ID,
          p_expected_version: 2,
          p_operation_id: OPERATION_ID,
        },
        result: rpcResult({ previous_state: "purchase_pending", state: "in_cart" }),
      },
    ]
    let index = 0
    t.mock.method(globalThis, "fetch", async (request, init) => {
      const item = calls[index++]
      assertRpcRequest(request, init, item.rpc, item.body)
      return Response.json(item.result)
    })

    for (const item of calls) await item.fn(item.input)
    assert.equal(index, calls.length)
  })
})

test("uncertain outcomes use a bounded attention reason and purchase reconciliation is explicit", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await loadModule()
    let calls = 0
    t.mock.method(globalThis, "fetch", async (request, init) => {
      calls += 1
      if (calls === 1) {
        assertRpcRequest(request, init, "admin_mark_shipment_attention", {
          p_shipment_id: SHIPMENT_ID,
          p_admin_user_id: ADMIN_ID,
          p_expected_version: 2,
          p_operation_id: OPERATION_ID,
          p_reason: "purchase_outcome_unknown",
        })
        return Response.json(
          rpcResult({ previous_state: "purchase_pending", state: "attention_required" }),
        )
      }
      assertRpcRequest(request, init, "admin_resolve_shipment_reconciliation", {
        p_shipment_id: SHIPMENT_ID,
        p_admin_user_id: ADMIN_ID,
        p_expected_version: 3,
        p_resolution: "purchased",
        p_provider_order_id: PROVIDER_ID,
        p_purchased_cost_cents: 1842,
      })
      return Response.json(
        rpcResult({ previous_state: "attention_required", state: "purchased", version: 4 }),
      )
    })

    await module.markShipmentAttention({
      ...commonMutation(),
      reason: "purchase_outcome_unknown",
    })
    await module.resolveShipmentReconciliation({
      shipmentId: SHIPMENT_ID,
      adminUserId: ADMIN_ID,
      expectedVersion: 3,
      resolution: "purchased",
      providerOrderId: PROVIDER_ID,
      purchasedCostCents: 1842,
    })
    assert.equal(calls, 2)
  })
})

test("generation cancellation posting and tracking use separate narrow RPCs", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await loadModule()
    const cases = [
      {
        fn: module.claimShipmentGeneration,
        rpc: "admin_claim_shipment_generation",
        input: commonMutation(),
        body: {
          p_shipment_id: SHIPMENT_ID,
          p_admin_user_id: ADMIN_ID,
          p_expected_version: 2,
          p_operation_id: OPERATION_ID,
        },
      },
      {
        fn: module.commitShipmentGeneration,
        rpc: "admin_commit_shipment_generation",
        input: commonMutation(),
        body: {
          p_shipment_id: SHIPMENT_ID,
          p_admin_user_id: ADMIN_ID,
          p_expected_version: 2,
          p_operation_id: OPERATION_ID,
        },
      },
      {
        fn: module.claimShipmentCancel,
        rpc: "admin_claim_shipment_cancel",
        input: commonMutation(),
        body: {
          p_shipment_id: SHIPMENT_ID,
          p_admin_user_id: ADMIN_ID,
          p_expected_version: 2,
          p_operation_id: OPERATION_ID,
        },
      },
      {
        fn: module.commitShipmentCancel,
        rpc: "admin_commit_shipment_cancel",
        input: commonMutation(),
        body: {
          p_shipment_id: SHIPMENT_ID,
          p_admin_user_id: ADMIN_ID,
          p_expected_version: 2,
          p_operation_id: OPERATION_ID,
        },
      },
      {
        fn: module.confirmShipmentPosting,
        rpc: "admin_confirm_shipment_posting",
        input: {
          shipmentId: SHIPMENT_ID,
          adminUserId: ADMIN_ID,
          expectedVersion: 2,
        },
        body: {
          p_shipment_id: SHIPMENT_ID,
          p_admin_user_id: ADMIN_ID,
          p_expected_version: 2,
        },
      },
      {
        fn: module.applyShipmentTrackingUpdate,
        rpc: "shipment_apply_tracking_update",
        input: {
          shipmentId: SHIPMENT_ID,
          expectedVersion: 2,
          trackingState: "delivered",
          providerStatus: "delivered",
          trackingCode: "AB123456789BR",
          eventFingerprint: "tracking:delivered:AB123456789BR",
        },
        body: {
          p_shipment_id: SHIPMENT_ID,
          p_expected_version: 2,
          p_tracking_state: "delivered",
          p_provider_status: "delivered",
          p_tracking_code: "AB123456789BR",
          p_event_fingerprint: "tracking:delivered:AB123456789BR",
        },
      },
    ]
    let index = 0
    t.mock.method(globalThis, "fetch", async (request, init) => {
      const item = cases[index++]
      assertRpcRequest(request, init, item.rpc, item.body)
      return Response.json(rpcResult())
    })

    for (const item of cases) await item.fn(item.input)
    assert.equal(index, cases.length)
  })
})

test("rejects arbitrary state, reason, resolution, malformed ids and invalid costs before fetch", async (t) => {
  const module = await loadModule()
  let calls = 0
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1
    return Response.json(rpcResult())
  })

  const invalidCalls = [
    () => module.claimShipmentPurchase({ ...commonMutation(), shipmentId: "bad-id" }),
    () => module.claimShipmentPurchase({ ...commonMutation(), operationId: "bad-id" }),
    () => module.claimShipmentPurchase({ ...commonMutation(), expectedVersion: 0 }),
    () =>
      module.commitShipmentPurchase({
        ...commonMutation(),
        providerOrderId: PROVIDER_ID,
        purchasedCostCents: -1,
      }),
    () =>
      module.markShipmentAttention({
        ...commonMutation(),
        reason: "invented_reason",
      }),
    () =>
      module.resolveShipmentReconciliation({
        shipmentId: SHIPMENT_ID,
        adminUserId: ADMIN_ID,
        expectedVersion: 3,
        resolution: "invented",
      }),
    () =>
      module.applyShipmentTrackingUpdate({
        shipmentId: SHIPMENT_ID,
        expectedVersion: 2,
        trackingState: "backwards_or_invented",
        providerStatus: "whatever",
        trackingCode: null,
        eventFingerprint: "tracking:test",
      }),
  ]

  for (const call of invalidCalls) await assert.rejects(call)
  assert.equal(calls, 0)
})

test("strictly parses only documented outcomes and shipment states", async (t) => {
  await withSupabaseEnv(async () => {
    const module = await loadModule()
    const valid = [
      rpcResult({ outcome: "transitioned", state: "purchase_pending" }),
      rpcResult({ outcome: "conflict" }),
      rpcResult({ outcome: "invalid_state" }),
      rpcResult({ outcome: "operation_mismatch" }),
      rpcResult({ outcome: "active_exists" }),
      {
        outcome: "not_found",
        shipment_id: null,
        order_id: null,
        previous_state: null,
        state: null,
        version: null,
      },
    ]
    let index = 0
    t.mock.method(globalThis, "fetch", async () => Response.json(valid[index++]))

    for (const expected of valid) {
      const actual = await module.claimShipmentPurchase(commonMutation())
      assert.equal(actual.outcome, expected.outcome)
    }
  })
})

test("malformed RPC responses and storage failures stay generic and never expose secret details", async (t) => {
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
        () => module.claimShipmentPurchase(commonMutation()),
        (error: unknown) =>
          error instanceof Error &&
          error.message === "Shipment operation failed" &&
          !error.message.includes("secret"),
      )
    }
  })
})
