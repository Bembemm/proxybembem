import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const SHIPMENT_ID = "11111111-1111-4111-8111-111111111111"
const SHIPMENT_ID_2 = "22222222-2222-4222-8222-222222222222"
const SHIPMENT_ID_3 = "33333333-3333-4333-8333-333333333333"
const ORDER_ID = "44444444-4444-4444-8444-444444444444"
const PROVIDER_ID = "6e1c864a-fe48-4ae7-baaa-d6e4888bafd1"
const PROVIDER_ID_2 = "7e1c864a-fe48-4ae7-baaa-d6e4888bafd2"
const PROVIDER_ID_3 = "8e1c864a-fe48-4ae7-baaa-d6e4888bafd3"

interface ShipmentLike {
  id: string
  orderId: string
  provider: "melhor_envio"
  environment: "production" | "sandbox"
  state: string
  providerShipmentId: string | null
  trackingCode: string | null
  providerStatus: string | null
  operationKind: string | null
  operationId: string | null
  version: number
}

interface ProviderTracking {
  providerShipmentId: string
  status: string
  trackingCode: string | null
  trackingUrl: string | null
}

interface OperationResult {
  outcome: string
  shipmentId: string | null
  orderId: string | null
  previousState: string | null
  state: string | null
  version: number | null
}

interface TrackingDependencies {
  getConfig(): { environment: "production" | "sandbox" }
  getShipment(shipmentId: string): Promise<ShipmentLike | null>
  listActiveShipments(limit: number): Promise<ShipmentLike[]>
  trackProvider(input: { providerShipmentIds: string[] }): Promise<ProviderTracking[]>
  applyTrackingUpdate(input: {
    shipmentId: string
    expectedVersion: number
    trackingState: "posted" | "in_transit" | "delivered"
    providerStatus: string
    trackingCode: string | null
    eventFingerprint: string
  }): Promise<OperationResult>
}

type RefreshResult = {
  outcome: string
  shipmentId?: string
  orderId?: string
  normalizedStatus?: string
}

type Module = {
  normalizeMelhorEnvioTrackingStatus(status: string):
    | "pre_posting"
    | "posted"
    | "in_transit"
    | "delivered"
    | "canceled"
    | "unknown"
  fingerprintTrackingEvent(input: {
    providerShipmentId: string
    providerStatus: string
    trackingCode: string | null
  }): string
  createShipmentTrackingService(deps: TrackingDependencies): {
    refreshShipmentTracking(input: { shipmentId: string }): Promise<RefreshResult>
    refreshActiveShipmentTrackingBatch(input: { limit: number }): Promise<{
      checked: number
      changed: number
      attention: number
    }>
  }
}

async function loadModule(): Promise<Module> {
  const path = "../lib/server/shipment-tracking.ts"
  const module = (await import(path)) as Partial<Module>
  assert.equal(typeof module.normalizeMelhorEnvioTrackingStatus, "function")
  assert.equal(typeof module.fingerprintTrackingEvent, "function")
  assert.equal(typeof module.createShipmentTrackingService, "function")
  return module as Module
}

function shipment(overrides: Partial<ShipmentLike> = {}): ShipmentLike {
  return {
    id: SHIPMENT_ID,
    orderId: ORDER_ID,
    provider: "melhor_envio",
    environment: "production",
    state: "generated",
    providerShipmentId: PROVIDER_ID,
    trackingCode: null,
    providerStatus: "released",
    operationKind: null,
    operationId: null,
    version: 7,
    ...overrides,
  }
}

function tracking(
  status: string,
  overrides: Partial<ProviderTracking> = {},
): ProviderTracking {
  return {
    providerShipmentId: PROVIDER_ID,
    status,
    trackingCode: "BR123456789BR",
    trackingUrl: "https://melhorenvio.com.br/rastreio/abc",
    ...overrides,
  }
}

function transitioned(state: string): OperationResult {
  return {
    outcome: "transitioned",
    shipmentId: SHIPMENT_ID,
    orderId: ORDER_ID,
    previousState: "generated",
    state,
    version: 8,
  }
}

function baseDeps(overrides: Partial<TrackingDependencies> = {}): TrackingDependencies {
  return {
    getConfig: () => ({ environment: "production" }),
    getShipment: async () => shipment(),
    listActiveShipments: async () => [shipment()],
    trackProvider: async () => [tracking("posted")],
    applyTrackingUpdate: async (input) => transitioned(input.trackingState),
    ...overrides,
  }
}

test("provider tracking status mapping is a small explicit allowlist", async () => {
  const module = await loadModule()
  const cases: Array<[string, ReturnType<Module["normalizeMelhorEnvioTrackingStatus"]>]> = [
    ["pending", "pre_posting"],
    ["released", "pre_posting"],
    ["posted", "posted"],
    ["in_transit", "in_transit"],
    ["in transit", "in_transit"],
    ["delivered", "delivered"],
    ["canceled", "canceled"],
    ["undelivered", "unknown"],
    ["not delivered", "unknown"],
    ["suspended", "unknown"],
    ["paused", "unknown"],
    ["future-provider-state", "unknown"],
  ]

  for (const [raw, expected] of cases) {
    assert.equal(module.normalizeMelhorEnvioTrackingStatus(raw), expected, raw)
  }
})

test("tracking fingerprint is deterministic, bounded and changes with provider evidence", async () => {
  const module = await loadModule()
  const input = {
    providerShipmentId: PROVIDER_ID,
    providerStatus: "posted",
    trackingCode: "BR123456789BR",
  }
  const first = module.fingerprintTrackingEvent(input)
  const second = module.fingerprintTrackingEvent(input)
  const different = module.fingerprintTrackingEvent({ ...input, providerStatus: "delivered" })

  assert.equal(first, second)
  assert.notEqual(first, different)
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.ok(first.length <= 120)
})

test("pre-posting provider state never advances local shipment or order", async () => {
  const module = await loadModule()
  let applies = 0
  const service = module.createShipmentTrackingService(
    baseDeps({
      trackProvider: async () => [tracking("released")],
      applyTrackingUpdate: async () => {
        applies += 1
        return transitioned("posted")
      },
    }),
  )

  assert.deepEqual(await service.refreshShipmentTracking({ shipmentId: SHIPMENT_ID }), {
    outcome: "unchanged",
    shipmentId: SHIPMENT_ID,
    orderId: ORDER_ID,
    normalizedStatus: "pre_posting",
  })
  assert.equal(applies, 0)
})

test("unknown and canceled provider states surface attention without inventing an order transition", async () => {
  const module = await loadModule()
  for (const [raw, normalized] of [
    ["suspended", "unknown"],
    ["canceled", "canceled"],
  ] as const) {
    let applies = 0
    const service = module.createShipmentTrackingService(
      baseDeps({
        trackProvider: async () => [tracking(raw)],
        applyTrackingUpdate: async () => {
          applies += 1
          return transitioned("posted")
        },
      }),
    )

    assert.deepEqual(await service.refreshShipmentTracking({ shipmentId: SHIPMENT_ID }), {
      outcome: "attention",
      shipmentId: SHIPMENT_ID,
      orderId: ORDER_ID,
      normalizedStatus: normalized,
    })
    assert.equal(applies, 0, raw)
  }
})

test("trusted posted state applies one atomic tracking RPC with deterministic evidence", async () => {
  const module = await loadModule()
  const calls: unknown[] = []
  const service = module.createShipmentTrackingService(
    baseDeps({
      applyTrackingUpdate: async (input) => {
        calls.push(input)
        return transitioned("posted")
      },
    }),
  )

  assert.deepEqual(await service.refreshShipmentTracking({ shipmentId: SHIPMENT_ID }), {
    outcome: "changed",
    shipmentId: SHIPMENT_ID,
    orderId: ORDER_ID,
    normalizedStatus: "posted",
  })
  assert.equal(calls.length, 1)
  const call = calls[0] as Record<string, unknown>
  assert.deepEqual(
    {
      shipmentId: call.shipmentId,
      expectedVersion: call.expectedVersion,
      trackingState: call.trackingState,
      providerStatus: call.providerStatus,
      trackingCode: call.trackingCode,
    },
    {
      shipmentId: SHIPMENT_ID,
      expectedVersion: 7,
      trackingState: "posted",
      providerStatus: "posted",
      trackingCode: "BR123456789BR",
    },
  )
  assert.match(String(call.eventFingerprint), /^[a-f0-9]{64}$/)
})

test("identical provider evidence is deduped before the mutation RPC", async () => {
  const module = await loadModule()
  let applies = 0
  const service = module.createShipmentTrackingService(
    baseDeps({
      getShipment: async () =>
        shipment({
          state: "posted",
          providerStatus: "posted",
          trackingCode: "BR123456789BR",
          version: 8,
        }),
      applyTrackingUpdate: async () => {
        applies += 1
        return transitioned("posted")
      },
    }),
  )

  assert.equal(
    (await service.refreshShipmentTracking({ shipmentId: SHIPMENT_ID })).outcome,
    "unchanged",
  )
  assert.equal(applies, 0)
})

test("stale provider responses cannot move a local shipment backwards", async () => {
  const module = await loadModule()
  for (const [localState, rawStatus] of [
    ["in_transit", "posted"],
    ["delivered", "posted"],
    ["delivered", "in_transit"],
  ]) {
    let applies = 0
    const service = module.createShipmentTrackingService(
      baseDeps({
        getShipment: async () => shipment({ state: localState, version: 10 }),
        trackProvider: async () => [tracking(rawStatus)],
        applyTrackingUpdate: async () => {
          applies += 1
          return transitioned(rawStatus)
        },
      }),
    )
    assert.equal(
      (await service.refreshShipmentTracking({ shipmentId: SHIPMENT_ID })).outcome,
      "unchanged",
      `${localState} <- ${rawStatus}`,
    )
    assert.equal(applies, 0, `${localState} <- ${rawStatus}`)
  }
})

test("trusted delivery advances through the existing atomic RPC and never uses a cancellation path", async () => {
  const module = await loadModule()
  const seen: unknown[] = []
  const service = module.createShipmentTrackingService(
    baseDeps({
      getShipment: async () => shipment({ state: "posted", version: 9 }),
      trackProvider: async () => [tracking("delivered")],
      applyTrackingUpdate: async (input) => {
        seen.push(input)
        return transitioned("delivered")
      },
    }),
  )

  assert.equal(
    (await service.refreshShipmentTracking({ shipmentId: SHIPMENT_ID })).outcome,
    "changed",
  )
  assert.equal((seen[0] as { trackingState: string }).trackingState, "delivered")

  const migration = await readFile(
    new URL("../supabase/migrations/202609080004_shipment_operations.sql", import.meta.url),
    "utf8",
  )
  const start = migration.indexOf("create or replace function public.shipment_apply_tracking_update")
  const block = migration.slice(start)
  assert.match(block, /p_tracking_state in \('posted','in_transit'\)[\s\S]*fulfillment_status='shipped'/)
  assert.match(block, /p_tracking_state='delivered'[\s\S]*fulfillment_status='completed'/)
  assert.doesNotMatch(block, /fulfillment_status='canceled'|payment_status\s*=/)
})

test("batch is bounded to provider capacity, provider-batched once, ownership-independent, and counts only safe outcomes", async () => {
  const module = await loadModule()
  const shipments = [
    shipment({ id: SHIPMENT_ID, providerShipmentId: PROVIDER_ID }),
    shipment({ id: SHIPMENT_ID_2, providerShipmentId: PROVIDER_ID_2 }),
    shipment({ id: SHIPMENT_ID_3, providerShipmentId: PROVIDER_ID_3 }),
  ]
  const listLimits: number[] = []
  const batches: string[][] = []
  const service = module.createShipmentTrackingService(
    baseDeps({
      listActiveShipments: async (limit) => {
        listLimits.push(limit)
        return shipments
      },
      trackProvider: async ({ providerShipmentIds }) => {
        batches.push(providerShipmentIds)
        return [
          tracking("posted", { providerShipmentId: PROVIDER_ID }),
          tracking("released", { providerShipmentId: PROVIDER_ID_2 }),
          tracking("suspended", { providerShipmentId: PROVIDER_ID_3 }),
        ]
      },
      applyTrackingUpdate: async (input) => ({
        ...transitioned(input.trackingState),
        shipmentId: input.shipmentId,
      }),
    }),
  )

  assert.deepEqual(await service.refreshActiveShipmentTrackingBatch({ limit: 20 }), {
    checked: 3,
    changed: 1,
    attention: 1,
  })
  assert.deepEqual(listLimits, [20])
  assert.deepEqual(batches, [[PROVIDER_ID, PROVIDER_ID_2, PROVIDER_ID_3]])

  for (const invalid of [0, -1, 21, 50, 1.5]) {
    await assert.rejects(
      service.refreshActiveShipmentTrackingBatch({ limit: invalid }),
      /tracking batch/i,
    )
  }
})

test("production repository exposes only bounded active server-side tracking candidates", async () => {
  const repository = await readFile(new URL("../lib/server/shipments.ts", import.meta.url), "utf8")
  assert.match(repository, /export async function listActiveShipmentsForTracking/)
  assert.match(repository, /state=in\.\(purchased,generated,posted,in_transit\)/)
  assert.match(repository, /provider_shipment_id=not\.is\.null/)
  assert.match(repository, /limit/)
  assert.doesNotMatch(repository, /customer_id=eq\.|auth\.uid\(\)/)
})
