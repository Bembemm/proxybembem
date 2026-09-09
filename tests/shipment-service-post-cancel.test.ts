import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
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
  providerStatus: string | null
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

interface Dependencies {
  getConfig(): { environment: "production" | "sandbox" }
  getShipment(shipmentId: string): Promise<ShipmentLike | null>
  confirmPosting(input: {
    shipmentId: string
    adminUserId: string
    expectedVersion: number
  }): Promise<OperationResult>
  ensureCancelAuthorization(): Promise<void>
  claimCancel(input: Record<string, unknown>): Promise<OperationResult>
  cancelProvider(input: {
    providerShipmentId: string
    description: string
  }): Promise<{ providerShipmentId: string; canceled: true }>
  readProvider(input: {
    providerShipmentId: string
    source: "order"
  }): Promise<ProviderState>
  commitCancel(input: Record<string, unknown>): Promise<OperationResult>
  markAttention(input: Record<string, unknown>): Promise<OperationResult>
  resolveReconciliation(input: Record<string, unknown>): Promise<OperationResult>
  createOperationId(): string
}

type Result = {
  outcome: string
  shipmentId?: string
  orderId?: string
  reason?: string
}

type Module = {
  createShipmentPostCancelService(deps: Dependencies): {
    postAdminShipment(input: { shipmentId: string; adminUserId: string }): Promise<Result>
    cancelAdminShipment(input: {
      shipmentId: string
      adminUserId: string
      description: string
    }): Promise<Result>
  }
}

async function loadModule(): Promise<Module> {
  const module = (await import("../lib/server/shipment-service.ts")) as Partial<Module>
  assert.equal(
    typeof module.createShipmentPostCancelService,
    "function",
    "Task 11 must export createShipmentPostCancelService",
  )
  return module as Module
}

function operationResult(overrides: Partial<OperationResult> = {}): OperationResult {
  return {
    outcome: "transitioned",
    shipmentId: SHIPMENT_ID,
    orderId: ORDER_ID,
    previousState: "generated",
    state: "posted",
    version: 8,
    ...overrides,
  }
}

function shipment(overrides: Partial<ShipmentLike> = {}): ShipmentLike {
  return {
    id: SHIPMENT_ID,
    orderId: ORDER_ID,
    environment: "production",
    provider: "melhor_envio",
    state: "generated",
    stableStateBeforeAttention: null,
    attentionReason: null,
    providerShipmentId: PROVIDER_ID,
    providerStatus: "released",
    operationKind: null,
    operationId: null,
    version: 7,
    ...overrides,
  }
}

function provider(status: string | null): ProviderState {
  return {
    providerShipmentId: PROVIDER_ID,
    status,
    priceCents: 1842,
    trackingCode: null,
    trackingUrl: null,
  }
}

function baseDeps(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    getConfig: () => ({ environment: "production" }),
    getShipment: async () => shipment(),
    confirmPosting: async () => operationResult(),
    ensureCancelAuthorization: async () => {},
    claimCancel: async () =>
      operationResult({ previousState: "generated", state: "cancel_pending", version: 8 }),
    cancelProvider: async () => ({ providerShipmentId: PROVIDER_ID, canceled: true }),
    readProvider: async () => provider("canceled"),
    commitCancel: async () =>
      operationResult({ previousState: "cancel_pending", state: "canceled", version: 9 }),
    markAttention: async () =>
      operationResult({ previousState: "cancel_pending", state: "attention_required", version: 9 }),
    resolveReconciliation: async () =>
      operationResult({ previousState: "attention_required", state: "canceled", version: 10 }),
    createOperationId: () => OPERATION_ID,
    ...overrides,
  }
}

test("explicit posting atomically delegates generated shipment + ready order transition to one RPC", async () => {
  const module = await loadModule()
  const calls: unknown[] = []
  const service = module.createShipmentPostCancelService(
    baseDeps({
      confirmPosting: async (input) => {
        calls.push(input)
        return operationResult()
      },
    }),
  )

  assert.deepEqual(
    await service.postAdminShipment({ shipmentId: SHIPMENT_ID, adminUserId: ADMIN_ID }),
    { outcome: "posted", shipmentId: SHIPMENT_ID, orderId: ORDER_ID },
  )
  assert.deepEqual(calls, [{ shipmentId: SHIPMENT_ID, adminUserId: ADMIN_ID, expectedVersion: 7 }])
})

test("posting is idempotent after trusted tracking already advanced shipment", async () => {
  const module = await loadModule()
  for (const state of ["posted", "in_transit", "delivered"]) {
    let mutations = 0
    const service = module.createShipmentPostCancelService(
      baseDeps({
        getShipment: async () => shipment({ state, version: 9 }),
        confirmPosting: async () => {
          mutations += 1
          return operationResult()
        },
      }),
    )
    assert.equal(
      (await service.postAdminShipment({ shipmentId: SHIPMENT_ID, adminUserId: ADMIN_ID })).outcome,
      "posted",
      state,
    )
    assert.equal(mutations, 0, state)
  }
})

test("purchased or generated label is never auto-posted by cancellation/post service", async () => {
  const module = await loadModule()
  let posts = 0
  const service = module.createShipmentPostCancelService(
    baseDeps({
      getShipment: async () => shipment({ state: "purchased" }),
      confirmPosting: async () => {
        posts += 1
        return operationResult()
      },
    }),
  )
  assert.equal(
    (await service.postAdminShipment({ shipmentId: SHIPMENT_ID, adminUserId: ADMIN_ID })).outcome,
    "invalid_state",
  )
  assert.equal(posts, 0)
})

test("confirmed cancellation claims before provider call then commits provider-confirmed cancellation", async () => {
  const module = await loadModule()
  const calls: Array<{ name: string; input?: unknown }> = []
  const service = module.createShipmentPostCancelService(
    baseDeps({
      ensureCancelAuthorization: async () => {
        calls.push({ name: "auth" })
      },
      claimCancel: async (input) => {
        calls.push({ name: "claim", input })
        return operationResult({ previousState: "generated", state: "cancel_pending", version: 8 })
      },
      cancelProvider: async (input) => {
        calls.push({ name: "cancel", input })
        return { providerShipmentId: PROVIDER_ID, canceled: true }
      },
      commitCancel: async (input) => {
        calls.push({ name: "commit", input })
        return operationResult({ previousState: "cancel_pending", state: "canceled", version: 9 })
      },
    }),
  )

  assert.deepEqual(
    await service.cancelAdminShipment({
      shipmentId: SHIPMENT_ID,
      adminUserId: ADMIN_ID,
      description: "Cancelamento solicitado pelo lojista",
    }),
    { outcome: "canceled", shipmentId: SHIPMENT_ID, orderId: ORDER_ID },
  )
  assert.deepEqual(calls.map((entry) => entry.name), ["auth", "claim", "cancel", "commit"])
  assert.deepEqual(calls[1]?.input, {
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedVersion: 7,
    operationId: OPERATION_ID,
  })
  assert.deepEqual(calls[3]?.input, {
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedVersion: 8,
    operationId: OPERATION_ID,
  })
})

test("definite provider cancellation rejection restores prior stable state without fake cancellation", async () => {
  const module = await loadModule()
  const resolutions: Record<string, unknown>[] = []
  let commits = 0
  const service = module.createShipmentPostCancelService(
    baseDeps({
      cancelProvider: async () => {
        throw new MelhorEnvioShipmentProviderError("definite_rejection", 422)
      },
      commitCancel: async () => {
        commits += 1
        return operationResult({ state: "canceled" })
      },
      resolveReconciliation: async (input) => {
        resolutions.push(input)
        return operationResult({
          previousState: "cancel_pending",
          state: "generated",
          version: 9,
        })
      },
    }),
  )

  assert.equal(
    (await service.cancelAdminShipment({
      shipmentId: SHIPMENT_ID,
      adminUserId: ADMIN_ID,
      description: "Cancelamento solicitado pelo lojista",
    })).outcome,
    "cancel_rejected",
  )
  assert.equal(commits, 0)
  assert.deepEqual(resolutions, [{
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedVersion: 8,
    resolution: "not_canceled",
  }])
})

test("ambiguous cancellation reconciles confirmed canceled provider state without a second cancel call", async () => {
  const module = await loadModule()
  let cancels = 0
  const service = module.createShipmentPostCancelService(
    baseDeps({
      cancelProvider: async () => {
        cancels += 1
        throw new MelhorEnvioShipmentProviderError("outcome_unknown", 503)
      },
      readProvider: async () => provider("canceled"),
    }),
  )

  assert.equal(
    (await service.cancelAdminShipment({
      shipmentId: SHIPMENT_ID,
      adminUserId: ADMIN_ID,
      description: "Cancelamento solicitado pelo lojista",
    })).outcome,
    "canceled",
  )
  assert.equal(cancels, 1)
})

test("ambiguous cancellation with inconclusive provider state enters attention and blocks repeat cancel", async () => {
  const module = await loadModule()
  const attentions: Record<string, unknown>[] = []
  let cancels = 0
  const service = module.createShipmentPostCancelService(
    baseDeps({
      cancelProvider: async () => {
        cancels += 1
        throw new MelhorEnvioShipmentProviderError("outcome_unknown", null)
      },
      readProvider: async () => provider("released"),
      markAttention: async (input) => {
        attentions.push(input)
        return operationResult({ previousState: "cancel_pending", state: "attention_required", version: 9 })
      },
    }),
  )

  assert.equal(
    (await service.cancelAdminShipment({
      shipmentId: SHIPMENT_ID,
      adminUserId: ADMIN_ID,
      description: "Cancelamento solicitado pelo lojista",
    })).outcome,
    "attention_required",
  )
  assert.equal(cancels, 1)
  assert.deepEqual(attentions, [{
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedVersion: 8,
    operationId: OPERATION_ID,
    reason: "cancel_outcome_unknown",
  }])
})

test("cancel attention is reconciliation-only: canceled resolves canceled; inconclusive never calls cancel again", async () => {
  const module = await loadModule()
  for (const status of ["canceled", "released"]) {
    let cancels = 0
    const resolutions: Record<string, unknown>[] = []
    const service = module.createShipmentPostCancelService(
      baseDeps({
        getShipment: async () => shipment({
          state: "attention_required",
          stableStateBeforeAttention: "generated",
          attentionReason: "cancel_outcome_unknown",
          operationKind: null,
          operationId: null,
          version: 9,
        }),
        cancelProvider: async () => {
          cancels += 1
          return { providerShipmentId: PROVIDER_ID, canceled: true }
        },
        readProvider: async () => provider(status),
        resolveReconciliation: async (input) => {
          resolutions.push(input)
          return operationResult({
            previousState: "attention_required",
            state: status === "canceled" ? "canceled" : "generated",
            version: 10,
          })
        },
      }),
    )
    const result = await service.cancelAdminShipment({
      shipmentId: SHIPMENT_ID,
      adminUserId: ADMIN_ID,
      description: "Cancelamento solicitado pelo lojista",
    })
    assert.equal(cancels, 0, status)
    if (status === "canceled") {
      assert.equal(result.outcome, "canceled")
      assert.deepEqual(resolutions, [{
        shipmentId: SHIPMENT_ID,
        adminUserId: ADMIN_ID,
        expectedVersion: 9,
        resolution: "canceled",
      }])
    } else {
      assert.equal(result.outcome, "attention_required")
      assert.deepEqual(resolutions, [])
    }
  }
})

test("missing cancellation authorization happens before durable claim", async () => {
  const module = await loadModule()
  let claims = 0
  const service = module.createShipmentPostCancelService(
    baseDeps({
      ensureCancelAuthorization: async () => {
        throw new MelhorEnvioTokenManagerError("reauthorization_required")
      },
      claimCancel: async () => {
        claims += 1
        return operationResult({ state: "cancel_pending" })
      },
    }),
  )
  assert.equal(
    (await service.cancelAdminShipment({
      shipmentId: SHIPMENT_ID,
      adminUserId: ADMIN_ID,
      description: "Cancelamento solicitado pelo lojista",
    })).outcome,
    "reauthorization_required",
  )
  assert.equal(claims, 0)
})

test("canceled shipment is idempotent and the foundation permits a replacement active shipment", async () => {
  const module = await loadModule()
  let providerCalls = 0
  const service = module.createShipmentPostCancelService(
    baseDeps({
      getShipment: async () => shipment({ state: "canceled", version: 10 }),
      cancelProvider: async () => {
        providerCalls += 1
        return { providerShipmentId: PROVIDER_ID, canceled: true }
      },
    }),
  )
  assert.equal(
    (await service.cancelAdminShipment({
      shipmentId: SHIPMENT_ID,
      adminUserId: ADMIN_ID,
      description: "Cancelamento solicitado pelo lojista",
    })).outcome,
    "canceled",
  )
  assert.equal(providerCalls, 0)

  const foundation = await readFile(
    new URL("../supabase/migrations/202609080003_shipments_foundation.sql", import.meta.url),
    "utf8",
  )
  assert.match(foundation, /shipments_one_active_per_order_uidx[\s\S]*where\s+state\s*<>\s*'canceled'/i)
})

test("posting and cancellation SQL never mutate payment or cancel the customer order", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202609080004_shipment_operations.sql", import.meta.url),
    "utf8",
  )
  const postingStart = migration.indexOf("create or replace function public.admin_confirm_shipment_posting")
  const postingEnd = migration.indexOf("create or replace function public.shipment_apply_tracking_update", postingStart)
  const posting = migration.slice(postingStart, postingEnd)
  assert.match(posting, /fulfillment_status='shipped'/)
  assert.doesNotMatch(posting, /payment_status|set\s+status\s*=|payment_/i)

  const cancelStart = migration.indexOf("create or replace function public.admin_commit_shipment_cancel")
  const cancelEnd = migration.indexOf("create or replace function public.admin_confirm_shipment_posting", cancelStart)
  const cancel = migration.slice(cancelStart, cancelEnd)
  assert.doesNotMatch(cancel, /update\s+public\.orders/i)
})

test("shared reconciliation contract supports cancellation resolution without adding a new RPC", async () => {
  const operations = await readFile(new URL("../lib/server/shipment-operations.ts", import.meta.url), "utf8")
  const migration = await readFile(
    new URL("../supabase/migrations/202609080004_shipment_operations.sql", import.meta.url),
    "utf8",
  )
  assert.match(operations, /RECONCILIATIONS\s*=\s*\[[^\]]*["']canceled["'][^\]]*["']not_canceled["'][^\]]*\]/)
  const start = migration.indexOf("create or replace function public.admin_resolve_shipment_reconciliation")
  const end = migration.indexOf("create or replace function public.admin_claim_shipment_generation", start)
  const block = migration.slice(start, end)
  assert.match(block, /cancel_outcome_unknown/)
  assert.match(block, /'canceled'/)
  assert.match(block, /'not_canceled'/)
  assert.match(block, /stable_state_before_attention/)
})
