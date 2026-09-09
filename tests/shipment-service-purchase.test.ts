import assert from "node:assert/strict"
import test from "node:test"
import { MelhorEnvioShipmentProviderError } from "../lib/server/melhor-envio-shipment-client.ts"
import { MelhorEnvioTokenManagerError } from "../lib/server/melhor-envio-token-manager.ts"

const SHIPMENT_ID = "11111111-1111-4111-8111-111111111111"
const ORDER_ID = "22222222-2222-4222-8222-222222222222"
const ADMIN_ID = "33333333-3333-4333-8333-333333333333"
const OPERATION_ID = "44444444-4444-4444-8444-444444444444"
const PROVIDER_ID = "6e1c864a-fe48-4ae7-baaa-d6e4888bafd1"

interface OperationResult {
  outcome: string
  shipmentId: string | null
  orderId: string | null
  previousState: string | null
  state: string | null
  version: number | null
}

interface ShipmentLike {
  id: string
  orderId: string
  environment: "production" | "sandbox"
  provider: "melhor_envio"
  state: string
  stableStateBeforeAttention: string | null
  attentionReason: string | null
  providerShipmentId: string | null
  providerCostCents: number | null
  purchasedCostCents: number | null
  operationKind: string | null
  operationId: string | null
  version: number
}

interface ProviderState {
  providerShipmentId: string
  status: string | null
  priceCents: number | null
  trackingCode: string | null
  trackingUrl: string | null
}

interface PurchaseDependencies {
  getConfig(): {
    environment: "production" | "sandbox"
    labelPurchaseEnabled: boolean
  }
  getShipment(shipmentId: string): Promise<ShipmentLike | null>
  readProvider(input: {
    providerShipmentId: string
    source: "cart" | "order"
  }): Promise<ProviderState>
  claimPurchase(input: Record<string, unknown>): Promise<OperationResult>
  checkout(input: {
    providerShipmentId: string
    currentCostCents: number
  }): Promise<{ providerOrderId: string; purchasedCostCents: number }>
  commitPurchase(input: Record<string, unknown>): Promise<OperationResult>
  revertPurchase(input: Record<string, unknown>): Promise<OperationResult>
  markAttention(input: Record<string, unknown>): Promise<OperationResult>
  resolveReconciliation(input: Record<string, unknown>): Promise<OperationResult>
  createOperationId(): string
}

type PurchaseResult = {
  outcome: string
  shipmentId?: string
  orderId?: string
  providerCostCents?: number
  purchasedCostCents?: number
  reason?: string
}

type Module = {
  createShipmentPurchaseService(deps: PurchaseDependencies): {
    purchaseAdminShipment(input: {
      shipmentId: string
      adminUserId: string
      expectedCostCents: number
    }): Promise<PurchaseResult>
    reconcileAdminShipmentPurchase(input: {
      shipmentId: string
      adminUserId: string
    }): Promise<PurchaseResult>
  }
}

async function loadModule(): Promise<Module> {
  return (await import("../lib/server/shipment-service.ts")) as Module
}

function operationResult(overrides: Partial<OperationResult> = {}): OperationResult {
  return {
    outcome: "transitioned",
    shipmentId: SHIPMENT_ID,
    orderId: ORDER_ID,
    previousState: "in_cart",
    state: "purchase_pending",
    version: 4,
    ...overrides,
  }
}

function shipment(overrides: Partial<ShipmentLike> = {}): ShipmentLike {
  return {
    id: SHIPMENT_ID,
    orderId: ORDER_ID,
    environment: "production",
    provider: "melhor_envio",
    state: "in_cart",
    stableStateBeforeAttention: null,
    attentionReason: null,
    providerShipmentId: PROVIDER_ID,
    providerCostCents: 1842,
    purchasedCostCents: null,
    operationKind: null,
    operationId: null,
    version: 3,
    ...overrides,
  }
}

function provider(overrides: Partial<ProviderState> = {}): ProviderState {
  return {
    providerShipmentId: PROVIDER_ID,
    status: "pending",
    priceCents: 1842,
    trackingCode: null,
    trackingUrl: null,
    ...overrides,
  }
}

function baseDeps(overrides: Partial<PurchaseDependencies> = {}): PurchaseDependencies {
  return {
    getConfig: () => ({ environment: "production", labelPurchaseEnabled: true }),
    getShipment: async () => shipment(),
    readProvider: async () => provider(),
    claimPurchase: async () => operationResult(),
    checkout: async () => ({ providerOrderId: PROVIDER_ID, purchasedCostCents: 1842 }),
    commitPurchase: async () =>
      operationResult({ previousState: "purchase_pending", state: "purchased", version: 5 }),
    revertPurchase: async () =>
      operationResult({ previousState: "purchase_pending", state: "in_cart", version: 5 }),
    markAttention: async () =>
      operationResult({ previousState: "purchase_pending", state: "attention_required", version: 5 }),
    resolveReconciliation: async (input) =>
      operationResult({
        previousState: "attention_required",
        state: input.resolution === "purchased" ? "purchased" : "in_cart",
        version: 6,
      }),
    createOperationId: () => OPERATION_ID,
    ...overrides,
  }
}

test("purchase stays fail-closed when the spending flag is disabled", async () => {
  const module = await loadModule()
  let reads = 0
  let checkouts = 0
  const service = module.createShipmentPurchaseService(
    baseDeps({
      getConfig: () => ({ environment: "production", labelPurchaseEnabled: false }),
      getShipment: async () => {
        reads += 1
        return shipment()
      },
      checkout: async () => {
        checkouts += 1
        return { providerOrderId: PROVIDER_ID, purchasedCostCents: 1842 }
      },
    }),
  )

  assert.deepEqual(
    await service.purchaseAdminShipment({
      shipmentId: SHIPMENT_ID,
      adminUserId: ADMIN_ID,
      expectedCostCents: 1842,
    }),
    { outcome: "purchase_disabled" },
  )
  assert.equal(reads, 0)
  assert.equal(checkouts, 0)
})

test("purchase re-reads current cart cost then claims and checks out exactly once", async () => {
  const module = await loadModule()
  const calls: Array<{ name: string; input: unknown }> = []
  const service = module.createShipmentPurchaseService(
    baseDeps({
      getShipment: async (id) => {
        calls.push({ name: "shipment", input: id })
        return shipment()
      },
      readProvider: async (input) => {
        calls.push({ name: "read", input })
        return provider()
      },
      claimPurchase: async (input) => {
        calls.push({ name: "claim", input })
        return operationResult()
      },
      checkout: async (input) => {
        calls.push({ name: "checkout", input })
        return { providerOrderId: PROVIDER_ID, purchasedCostCents: 1842 }
      },
      commitPurchase: async (input) => {
        calls.push({ name: "commit", input })
        return operationResult({ previousState: "purchase_pending", state: "purchased", version: 5 })
      },
    }),
  )

  assert.deepEqual(
    await service.purchaseAdminShipment({
      shipmentId: SHIPMENT_ID,
      adminUserId: ADMIN_ID,
      expectedCostCents: 1842,
    }),
    {
      outcome: "purchased",
      shipmentId: SHIPMENT_ID,
      orderId: ORDER_ID,
      purchasedCostCents: 1842,
    },
  )
  assert.deepEqual(calls.map((entry) => entry.name), ["shipment", "read", "claim", "checkout", "commit"])
  assert.deepEqual(calls[1]?.input, { providerShipmentId: PROVIDER_ID, source: "cart" })
  assert.deepEqual(calls[2]?.input, {
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedVersion: 3,
    operationId: OPERATION_ID,
  })
  assert.deepEqual(calls[3]?.input, {
    providerShipmentId: PROVIDER_ID,
    currentCostCents: 1842,
  })
  assert.deepEqual(calls[4]?.input, {
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedVersion: 4,
    operationId: OPERATION_ID,
    providerOrderId: PROVIDER_ID,
    purchasedCostCents: 1842,
  })
})

test("changed provider cost requires a fresh explicit confirmation and never claims or spends", async () => {
  const module = await loadModule()
  let claims = 0
  let checkouts = 0
  const service = module.createShipmentPurchaseService(
    baseDeps({
      readProvider: async () => provider({ priceCents: 1990 }),
      claimPurchase: async () => {
        claims += 1
        return operationResult()
      },
      checkout: async () => {
        checkouts += 1
        return { providerOrderId: PROVIDER_ID, purchasedCostCents: 1990 }
      },
    }),
  )

  assert.deepEqual(
    await service.purchaseAdminShipment({
      shipmentId: SHIPMENT_ID,
      adminUserId: ADMIN_ID,
      expectedCostCents: 1842,
    }),
    {
      outcome: "price_changed",
      shipmentId: SHIPMENT_ID,
      orderId: ORDER_ID,
      providerCostCents: 1990,
    },
  )
  assert.equal(claims, 0)
  assert.equal(checkouts, 0)
})

test("a conflicting durable purchase claim is busy and never calls checkout", async () => {
  const module = await loadModule()
  let checkouts = 0
  const service = module.createShipmentPurchaseService(
    baseDeps({
      claimPurchase: async () => operationResult({ outcome: "conflict", state: "in_cart", version: 4 }),
      checkout: async () => {
        checkouts += 1
        return { providerOrderId: PROVIDER_ID, purchasedCostCents: 1842 }
      },
    }),
  )

  assert.deepEqual(
    await service.purchaseAdminShipment({
      shipmentId: SHIPMENT_ID,
      adminUserId: ADMIN_ID,
      expectedCostCents: 1842,
    }),
    { outcome: "busy", shipmentId: SHIPMENT_ID, orderId: ORDER_ID },
  )
  assert.equal(checkouts, 0)
})

test("definite checkout rejection and missing authorization revert the durable claim", async () => {
  const module = await loadModule()

  for (const kind of ["provider", "auth"] as const) {
    const reverts: Record<string, unknown>[] = []
    const service = module.createShipmentPurchaseService(
      baseDeps({
        checkout: async () => {
          if (kind === "auth") throw new MelhorEnvioTokenManagerError("reauthorization_required")
          throw new MelhorEnvioShipmentProviderError("definite_rejection", 422)
        },
        revertPurchase: async (input) => {
          reverts.push(input)
          return operationResult({ previousState: "purchase_pending", state: "in_cart", version: 5 })
        },
      }),
    )

    assert.deepEqual(
      await service.purchaseAdminShipment({
        shipmentId: SHIPMENT_ID,
        adminUserId: ADMIN_ID,
        expectedCostCents: 1842,
      }),
      {
        outcome: kind === "auth" ? "reauthorization_required" : "provider_rejected",
        shipmentId: SHIPMENT_ID,
        orderId: ORDER_ID,
      },
    )
    assert.deepEqual(reverts, [{
      shipmentId: SHIPMENT_ID,
      adminUserId: ADMIN_ID,
      expectedVersion: 4,
      operationId: OPERATION_ID,
    }])
  }
})

test("ambiguous checkout enters purchase attention and is never retried", async () => {
  const module = await loadModule()
  let checkoutCalls = 0
  const attentions: Record<string, unknown>[] = []
  const service = module.createShipmentPurchaseService(
    baseDeps({
      checkout: async () => {
        checkoutCalls += 1
        throw new MelhorEnvioShipmentProviderError("outcome_unknown", null)
      },
      markAttention: async (input) => {
        attentions.push(input)
        return operationResult({ previousState: "purchase_pending", state: "attention_required", version: 5 })
      },
    }),
  )

  assert.deepEqual(
    await service.purchaseAdminShipment({
      shipmentId: SHIPMENT_ID,
      adminUserId: ADMIN_ID,
      expectedCostCents: 1842,
    }),
    {
      outcome: "attention_required",
      shipmentId: SHIPMENT_ID,
      orderId: ORDER_ID,
      reason: "purchase_outcome_unknown",
    },
  )
  assert.equal(checkoutCalls, 1)
  assert.deepEqual(attentions, [{
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedVersion: 4,
    operationId: OPERATION_ID,
    reason: "purchase_outcome_unknown",
  }])
})

test("reconciliation confirms purchased by reading the provider order and never spends", async () => {
  const module = await loadModule()
  const reads: unknown[] = []
  const resolutions: Record<string, unknown>[] = []
  let checkouts = 0
  const service = module.createShipmentPurchaseService(
    baseDeps({
      getShipment: async () => shipment({
        state: "attention_required",
        stableStateBeforeAttention: "in_cart",
        attentionReason: "purchase_outcome_unknown",
        version: 5,
      }),
      readProvider: async (input) => {
        reads.push(input)
        return provider({ status: "paid", priceCents: 1842 })
      },
      resolveReconciliation: async (input) => {
        resolutions.push(input)
        return operationResult({ previousState: "attention_required", state: "purchased", version: 6 })
      },
      checkout: async () => {
        checkouts += 1
        return { providerOrderId: PROVIDER_ID, purchasedCostCents: 1842 }
      },
    }),
  )

  assert.deepEqual(
    await service.reconcileAdminShipmentPurchase({ shipmentId: SHIPMENT_ID, adminUserId: ADMIN_ID }),
    {
      outcome: "reconciled_purchased",
      shipmentId: SHIPMENT_ID,
      orderId: ORDER_ID,
      purchasedCostCents: 1842,
    },
  )
  assert.deepEqual(reads, [{ providerShipmentId: PROVIDER_ID, source: "order" }])
  assert.deepEqual(resolutions, [{
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedVersion: 5,
    resolution: "purchased",
    providerOrderId: PROVIDER_ID,
    purchasedCostCents: 1842,
  }])
  assert.equal(checkouts, 0)
})

test("reconciliation confirms not purchased only when order is absent and cart still exists", async () => {
  const module = await loadModule()
  const reads: Array<{ source: string }> = []
  const resolutions: Record<string, unknown>[] = []
  const service = module.createShipmentPurchaseService(
    baseDeps({
      getShipment: async () => shipment({
        state: "attention_required",
        stableStateBeforeAttention: "in_cart",
        attentionReason: "purchase_outcome_unknown",
        version: 5,
      }),
      readProvider: async (input) => {
        reads.push({ source: input.source })
        if (input.source === "order") {
          throw new MelhorEnvioShipmentProviderError("definite_rejection", 404)
        }
        return provider({ status: "pending" })
      },
      resolveReconciliation: async (input) => {
        resolutions.push(input)
        return operationResult({ previousState: "attention_required", state: "in_cart", version: 6 })
      },
    }),
  )

  assert.deepEqual(
    await service.reconcileAdminShipmentPurchase({ shipmentId: SHIPMENT_ID, adminUserId: ADMIN_ID }),
    {
      outcome: "reconciled_not_purchased",
      shipmentId: SHIPMENT_ID,
      orderId: ORDER_ID,
    },
  )
  assert.deepEqual(reads, [{ source: "order" }, { source: "cart" }])
  assert.deepEqual(resolutions, [{
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedVersion: 5,
    resolution: "not_purchased",
    providerOrderId: null,
    purchasedCostCents: null,
  }])
})

test("unresolved reconciliation stays in attention and never performs checkout", async () => {
  const module = await loadModule()
  let resolutions = 0
  let checkouts = 0
  const service = module.createShipmentPurchaseService(
    baseDeps({
      getShipment: async () => shipment({
        state: "attention_required",
        stableStateBeforeAttention: "in_cart",
        attentionReason: "purchase_outcome_unknown",
        version: 5,
      }),
      readProvider: async () => {
        throw new MelhorEnvioShipmentProviderError("outcome_unknown", null)
      },
      resolveReconciliation: async () => {
        resolutions += 1
        return operationResult()
      },
      checkout: async () => {
        checkouts += 1
        return { providerOrderId: PROVIDER_ID, purchasedCostCents: 1842 }
      },
    }),
  )

  assert.deepEqual(
    await service.reconcileAdminShipmentPurchase({ shipmentId: SHIPMENT_ID, adminUserId: ADMIN_ID }),
    {
      outcome: "attention_required",
      shipmentId: SHIPMENT_ID,
      orderId: ORDER_ID,
      reason: "purchase_outcome_unknown",
    },
  )
  assert.equal(resolutions, 0)
  assert.equal(checkouts, 0)
})

test("purchase and reconciliation reject malformed trusted identifiers before storage", async () => {
  const module = await loadModule()
  let reads = 0
  const service = module.createShipmentPurchaseService(
    baseDeps({
      getShipment: async () => {
        reads += 1
        return shipment()
      },
    }),
  )

  await assert.rejects(() => service.purchaseAdminShipment({
    shipmentId: "bad-id",
    adminUserId: ADMIN_ID,
    expectedCostCents: 1842,
  }))
  await assert.rejects(() => service.purchaseAdminShipment({
    shipmentId: SHIPMENT_ID,
    adminUserId: "bad-id",
    expectedCostCents: 1842,
  }))
  await assert.rejects(() => service.purchaseAdminShipment({
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedCostCents: 0,
  }))
  await assert.rejects(() => service.reconcileAdminShipmentPurchase({
    shipmentId: "bad-id",
    adminUserId: ADMIN_ID,
  }))
  assert.equal(reads, 0)
})
