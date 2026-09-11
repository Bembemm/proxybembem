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
  documentMode: "declaration_content" | "invoice"
  state: string
  providerShipmentId: string | null
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

interface GenerationDependencies {
  getConfig(): { environment: "production" | "sandbox" }
  getShipment(shipmentId: string): Promise<ShipmentLike | null>
  ensureAuthorization(): Promise<void>
  claimGeneration(input: Record<string, unknown>): Promise<OperationResult>
  generate(input: { providerShipmentId: string }): Promise<{ accepted: true }>
  readProvider(input: {
    providerShipmentId: string
    source: "order"
  }): Promise<ProviderState>
  commitGeneration(input: Record<string, unknown>): Promise<OperationResult>
  createOperationId(): string
}

type GenerationResult = {
  outcome: string
  shipmentId?: string
  orderId?: string
}

type Module = {
  createShipmentGenerationService(deps: GenerationDependencies): {
    generateAdminShipment(input: {
      shipmentId: string
      adminUserId: string
    }): Promise<GenerationResult>
  }
}

async function loadModule(): Promise<Module> {
  const module = (await import("../lib/server/shipment-service.ts")) as Partial<Module>
  assert.equal(
    typeof module.createShipmentGenerationService,
    "function",
    "Task 10 must export createShipmentGenerationService",
  )
  return module as Module
}

function operationResult(overrides: Partial<OperationResult> = {}): OperationResult {
  return {
    outcome: "transitioned",
    shipmentId: SHIPMENT_ID,
    orderId: ORDER_ID,
    previousState: "purchased",
    state: "generation_pending",
    version: 6,
    ...overrides,
  }
}

function shipment(overrides: Partial<ShipmentLike> = {}): ShipmentLike {
  return {
    id: SHIPMENT_ID,
    orderId: ORDER_ID,
    environment: "production",
    provider: "melhor_envio",
    documentMode: "declaration_content",
    state: "purchased",
    providerShipmentId: PROVIDER_ID,
    operationKind: null,
    operationId: null,
    version: 5,
    ...overrides,
  }
}

function provider(overrides: Partial<ProviderState> = {}): ProviderState {
  return {
    providerShipmentId: PROVIDER_ID,
    status: "released",
    priceCents: 1842,
    trackingCode: null,
    trackingUrl: null,
    ...overrides,
  }
}

function baseDeps(overrides: Partial<GenerationDependencies> = {}): GenerationDependencies {
  return {
    getConfig: () => ({ environment: "production" }),
    getShipment: async () => shipment(),
    ensureAuthorization: async () => {},
    claimGeneration: async () => operationResult(),
    generate: async () => ({ accepted: true }),
    readProvider: async () => provider(),
    commitGeneration: async () =>
      operationResult({
        previousState: "generation_pending",
        state: "generated",
        version: 7,
      }),
    createOperationId: () => OPERATION_ID,
    ...overrides,
  }
}

test("generation is a separate explicit operation and is blocked before confirmed purchase", async () => {
  const module = await loadModule()
  const calls: string[] = []
  const service = module.createShipmentGenerationService(
    baseDeps({
      getShipment: async () => shipment({ state: "in_cart" }),
      ensureAuthorization: async () => {
        calls.push("auth")
      },
      claimGeneration: async () => {
        calls.push("claim")
        return operationResult()
      },
      generate: async () => {
        calls.push("generate")
        return { accepted: true }
      },
    }),
  )

  assert.deepEqual(
    await service.generateAdminShipment({ shipmentId: SHIPMENT_ID, adminUserId: ADMIN_ID }),
    { outcome: "invalid_state", shipmentId: SHIPMENT_ID, orderId: ORDER_ID },
  )
  assert.deepEqual(calls, [])
})

test("purchased shipment claims generation, calls provider once, verifies released state and commits", async () => {
  const module = await loadModule()
  const calls: Array<{ name: string; input?: unknown }> = []
  const service = module.createShipmentGenerationService(
    baseDeps({
      ensureAuthorization: async () => {
        calls.push({ name: "auth" })
      },
      claimGeneration: async (input) => {
        calls.push({ name: "claim", input })
        return operationResult()
      },
      generate: async (input) => {
        calls.push({ name: "generate", input })
        return { accepted: true }
      },
      readProvider: async (input) => {
        calls.push({ name: "read", input })
        return provider({ status: "released" })
      },
      commitGeneration: async (input) => {
        calls.push({ name: "commit", input })
        return operationResult({
          previousState: "generation_pending",
          state: "generated",
          version: 7,
        })
      },
    }),
  )

  assert.deepEqual(
    await service.generateAdminShipment({ shipmentId: SHIPMENT_ID, adminUserId: ADMIN_ID }),
    { outcome: "generated", shipmentId: SHIPMENT_ID, orderId: ORDER_ID },
  )
  assert.deepEqual(calls.map((entry) => entry.name), ["auth", "claim", "generate", "read", "commit"])
  assert.deepEqual(calls[1]?.input, {
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedVersion: 5,
    operationId: OPERATION_ID,
  })
  assert.deepEqual(calls[2]?.input, { providerShipmentId: PROVIDER_ID })
  assert.deepEqual(calls[3]?.input, { providerShipmentId: PROVIDER_ID, source: "order" })
  assert.deepEqual(calls[4]?.input, {
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedVersion: 6,
    operationId: OPERATION_ID,
  })
})

test("provider acknowledgement alone leaves generation pending until order state confirms readiness", async () => {
  const module = await loadModule()
  let commits = 0
  const service = module.createShipmentGenerationService(
    baseDeps({
      readProvider: async () => provider({ status: "pending" }),
      commitGeneration: async () => {
        commits += 1
        return operationResult({ state: "generated" })
      },
    }),
  )

  assert.deepEqual(
    await service.generateAdminShipment({ shipmentId: SHIPMENT_ID, adminUserId: ADMIN_ID }),
    { outcome: "generation_pending", shipmentId: SHIPMENT_ID, orderId: ORDER_ID },
  )
  assert.equal(commits, 0)
})

test("generation_pending is reconciliation-only and never blindly sends generate again", async () => {
  const module = await loadModule()
  let generates = 0
  const commits: Record<string, unknown>[] = []
  const service = module.createShipmentGenerationService(
    baseDeps({
      getShipment: async () =>
        shipment({
          state: "generation_pending",
          operationKind: "generation",
          operationId: OPERATION_ID,
          version: 6,
        }),
      generate: async () => {
        generates += 1
        return { accepted: true }
      },
      readProvider: async () => provider({ status: "released" }),
      commitGeneration: async (input) => {
        commits.push(input)
        return operationResult({
          previousState: "generation_pending",
          state: "generated",
          version: 7,
        })
      },
    }),
  )

  assert.deepEqual(
    await service.generateAdminShipment({ shipmentId: SHIPMENT_ID, adminUserId: ADMIN_ID }),
    { outcome: "generated", shipmentId: SHIPMENT_ID, orderId: ORDER_ID },
  )
  assert.equal(generates, 0)
  assert.deepEqual(commits, [{
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedVersion: 6,
    operationId: OPERATION_ID,
  }])
})

test("ambiguous generation reconciles by reading provider state and never retries generation", async () => {
  const module = await loadModule()
  let generates = 0
  const service = module.createShipmentGenerationService(
    baseDeps({
      generate: async () => {
        generates += 1
        throw new MelhorEnvioShipmentProviderError("outcome_unknown", null)
      },
      readProvider: async () => provider({ status: "released" }),
    }),
  )

  assert.deepEqual(
    await service.generateAdminShipment({ shipmentId: SHIPMENT_ID, adminUserId: ADMIN_ID }),
    { outcome: "generated", shipmentId: SHIPMENT_ID, orderId: ORDER_ID },
  )
  assert.equal(generates, 1)
})

test("missing generation authorization is detected before the durable generation claim", async () => {
  const module = await loadModule()
  let claims = 0
  let generates = 0
  const service = module.createShipmentGenerationService(
    baseDeps({
      ensureAuthorization: async () => {
        throw new MelhorEnvioTokenManagerError("reauthorization_required")
      },
      claimGeneration: async () => {
        claims += 1
        return operationResult()
      },
      generate: async () => {
        generates += 1
        return { accepted: true }
      },
    }),
  )

  assert.deepEqual(
    await service.generateAdminShipment({ shipmentId: SHIPMENT_ID, adminUserId: ADMIN_ID }),
    { outcome: "reauthorization_required", shipmentId: SHIPMENT_ID, orderId: ORDER_ID },
  )
  assert.equal(claims, 0)
  assert.equal(generates, 0)
})

test("an already generated shipment is idempotent and performs no provider mutation", async () => {
  const module = await loadModule()
  let providerCalls = 0
  const service = module.createShipmentGenerationService(
    baseDeps({
      getShipment: async () => shipment({ state: "generated", version: 7 }),
      ensureAuthorization: async () => {
        providerCalls += 1
      },
      generate: async () => {
        providerCalls += 1
        return { accepted: true }
      },
      readProvider: async () => {
        providerCalls += 1
        return provider()
      },
    }),
  )

  assert.deepEqual(
    await service.generateAdminShipment({ shipmentId: SHIPMENT_ID, adminUserId: ADMIN_ID }),
    { outcome: "generated", shipmentId: SHIPMENT_ID, orderId: ORDER_ID },
  )
  assert.equal(providerCalls, 0)
})

test("generation commit RPC never changes order fulfillment status", async () => {
  const migration = new URL(
    "../supabase/migrations/202609080004_shipment_operations.sql",
    import.meta.url,
  )
  const text = await readFile(migration, "utf8")
  const start = text.indexOf("create or replace function public.admin_commit_shipment_generation")
  const end = text.indexOf("create or replace function public.admin_claim_shipment_cancel", start)
  assert.ok(start >= 0 && end > start)
  const block = text.slice(start, end)
  assert.doesNotMatch(block, /update\s+public\.orders/i)
  assert.match(block, /state='generated'/)
})
