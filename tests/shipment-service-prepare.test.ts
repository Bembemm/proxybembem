import assert from "node:assert/strict"
import test from "node:test"
import { MelhorEnvioShipmentProviderError } from "../lib/server/melhor-envio-shipment-client.ts"
import { ShipmentSnapshotError } from "../lib/server/shipment-snapshot.ts"

const ORDER_ID = "11111111-1111-4111-8111-111111111111"
const ADMIN_ID = "22222222-2222-4222-8222-222222222222"
const SENDER_ID = "33333333-3333-4333-8333-333333333333"
const SHIPMENT_ID = "44444444-4444-4444-8444-444444444444"
const OPERATION_ID = "55555555-5555-4555-8555-555555555555"
const PROVIDER_ID = "6e1c864a-fe48-4ae7-baaa-d6e4888bafd1"

interface OperationResult {
  outcome: string
  shipmentId: string | null
  orderId: string | null
  previousState: string | null
  state: string | null
  version: number | null
}

interface PrepareResult {
  outcome: string
  shipmentId?: string
  providerCostCents?: number
  reason?: string
}

interface Sender {
  id: string
  environment: "production" | "sandbox"
  personType: "pf" | "pj"
  fullName: string
  cpf: string | null
  cnpj: string | null
  stateRegister: string | null
  economicActivityCode: string | null
  email: string
  phone: string
  postalCode: string
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
  version: number
  updatedAt: string
}

interface Snapshot {
  service: { id: string; name: string; carrier: string }
  customerShippingCents: number
  recipient: Record<string, unknown>
  package: Record<string, unknown>
  declarationItems: Array<Record<string, unknown>>
  declarationValueCents: number
}

interface ShipmentLike {
  id: string
  orderId: string
  state: string
  version: number
  operationKind: string | null
  operationId: string | null
}

interface ServiceDependencies {
  getConfig(): { environment: "production" | "sandbox"; originCep: string }
  getOrder(orderId: string): Promise<Record<string, unknown> | null>
  getSenderProfile(
    environment: "production" | "sandbox",
    personType: "pf" | "pj",
  ): Promise<Sender | null>
  getActiveShipment(orderId: string): Promise<ShipmentLike | null>
  buildSnapshot(input: {
    order: Record<string, unknown>
    sender: Sender
    expectedOriginCep: string
  }): Snapshot
  createDraft(input: Record<string, unknown>): Promise<OperationResult>
  claimPrepare(input: Record<string, unknown>): Promise<OperationResult>
  commitCart(input: Record<string, unknown>): Promise<OperationResult>
  revertPrepare(input: Record<string, unknown>): Promise<OperationResult>
  markAttention(input: Record<string, unknown>): Promise<OperationResult>
  addToCart(input: Record<string, unknown>): Promise<{
    providerShipmentId: string
    currentCostCents: number
  }>
  createOperationId(): string
}

type ServiceModule = {
  createShipmentPreparationService(deps: ServiceDependencies): {
    prepareAdminShipment(input: { orderId: string; adminUserId: string }): Promise<PrepareResult>
  }
}

async function loadService(): Promise<ServiceModule> {
  const path = "../lib/server/shipment-service.ts"
  return (await import(path)) as ServiceModule
}

function operationResult(overrides: Partial<OperationResult> = {}): OperationResult {
  return {
    outcome: "transitioned",
    shipmentId: SHIPMENT_ID,
    orderId: ORDER_ID,
    previousState: "draft",
    state: "prepared",
    version: 2,
    ...overrides,
  }
}

function order() {
  return {
    id: ORDER_ID,
    payment_status: "approved",
    fulfillment_status: "ready_to_ship",
    shipping_provider: "melhor_envio",
    shipping_service_id: "2",
    shipping_service_name: "SEDEX",
    shipping_carrier_name: "Correios",
    shipping_cents: 1842,
  }
}

function sender(): Sender {
  return {
    id: SENDER_ID,
    environment: "production",
    personType: "pf",
    fullName: "Breno Bembem",
    cpf: "52998224725",
    cnpj: null,
    stateRegister: null,
    economicActivityCode: null,
    email: "contato@proxybembem.com.br",
    phone: "44999999999",
    postalCode: "86730000",
    street: "Rua do Remetente",
    number: "10",
    complement: null,
    neighborhood: "Centro",
    city: "Astorga",
    state: "PR",
    version: 3,
    updatedAt: "2026-09-09T09:00:00.000Z",
  }
}

function snapshot(): Snapshot {
  return {
    service: { id: "2", name: "SEDEX", carrier: "Correios" },
    customerShippingCents: 1842,
    recipient: {
      name: "Cliente Teste",
      email: "cliente@example.com",
      phone: "5511999999999",
      postalCode: "01310100",
      street: "Avenida Paulista",
      number: "1000",
      complement: null,
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    },
    package: {
      height: 5,
      width: 15,
      length: 20,
      weight: 0.5,
      insuranceValueCents: 11990,
    },
    declarationItems: [
      {
        productId: 1,
        description: "Deck Commander Proxy 100 Cartas",
        quantity: 1,
        unitValueCents: 11990,
      },
    ],
    declarationValueCents: 11990,
  }
}

function baseDeps(overrides: Partial<ServiceDependencies> = {}): ServiceDependencies {
  const trustedOrder = order()
  const trustedSender = sender()
  const trustedSnapshot = snapshot()

  return {
    getConfig: () => ({ environment: "production", originCep: "86730000" }),
    getOrder: async () => trustedOrder,
    getSenderProfile: async () => trustedSender,
    getActiveShipment: async () => null,
    buildSnapshot: () => trustedSnapshot,
    createDraft: async () =>
      operationResult({
        outcome: "created",
        previousState: null,
        state: "draft",
        version: 1,
      }),
    claimPrepare: async () => operationResult(),
    commitCart: async () =>
      operationResult({ previousState: "prepared", state: "in_cart", version: 3 }),
    revertPrepare: async () =>
      operationResult({ previousState: "prepared", state: "prepared", version: 3 }),
    markAttention: async () =>
      operationResult({ previousState: "prepared", state: "attention_required", version: 3 }),
    addToCart: async () => ({ providerShipmentId: PROVIDER_ID, currentCostCents: 1842 }),
    createOperationId: () => OPERATION_ID,
    ...overrides,
  }
}

test("prepares one PF/DC-e shipment from trusted order, sender and saved quote snapshot", async () => {
  const module = await loadService()
  const calls: Array<{ name: string; input: unknown }> = []
  const trustedOrder = order()
  const trustedSender = sender()
  const trustedSnapshot = snapshot()

  const service = module.createShipmentPreparationService(
    baseDeps({
      getOrder: async (orderId) => {
        calls.push({ name: "order", input: orderId })
        return trustedOrder
      },
      getSenderProfile: async (environment, personType) => {
        calls.push({ name: "sender", input: { environment, personType } })
        return trustedSender
      },
      buildSnapshot: (input) => {
        calls.push({ name: "snapshot", input })
        return trustedSnapshot
      },
      createDraft: async (input) => {
        calls.push({ name: "draft", input })
        return operationResult({
          outcome: "created",
          previousState: null,
          state: "draft",
          version: 1,
        })
      },
      claimPrepare: async (input) => {
        calls.push({ name: "claim", input })
        return operationResult()
      },
      addToCart: async (input) => {
        calls.push({ name: "provider", input })
        return { providerShipmentId: PROVIDER_ID, currentCostCents: 1842 }
      },
      commitCart: async (input) => {
        calls.push({ name: "commit", input })
        return operationResult({ previousState: "prepared", state: "in_cart", version: 3 })
      },
    }),
  )

  const result = await service.prepareAdminShipment({ orderId: ORDER_ID, adminUserId: ADMIN_ID })
  assert.deepEqual(result, {
    outcome: "prepared",
    shipmentId: SHIPMENT_ID,
    providerCostCents: 1842,
  })

  assert.deepEqual(calls.map((entry) => entry.name), [
    "order",
    "sender",
    "snapshot",
    "draft",
    "claim",
    "provider",
    "commit",
  ])
  assert.deepEqual(calls[1]?.input, { environment: "production", personType: "pf" })
  assert.deepEqual(calls[2]?.input, {
    order: trustedOrder,
    sender: trustedSender,
    expectedOriginCep: "86730000",
  })
  assert.deepEqual(calls[3]?.input, {
    orderId: ORDER_ID,
    adminUserId: ADMIN_ID,
    senderProfileId: SENDER_ID,
    senderProfileVersion: 3,
    environment: "production",
    documentMode: "declaration_content",
    invoiceKey: null,
    serviceId: "2",
    serviceName: "SEDEX",
    carrierName: "Correios",
    customerShippingCents: 1842,
    recipientSnapshot: trustedSnapshot.recipient,
    senderSnapshot: {
      personType: "pf",
      fullName: "Breno Bembem",
      cpf: "52998224725",
      cnpj: null,
      stateRegister: null,
      economicActivityCode: null,
      email: "contato@proxybembem.com.br",
      phone: "44999999999",
      postalCode: "86730000",
      street: "Rua do Remetente",
      number: "10",
      complement: null,
      neighborhood: "Centro",
      city: "Astorga",
      state: "PR",
    },
    packageSnapshot: trustedSnapshot.package,
    declarationItemsSnapshot: trustedSnapshot.declarationItems,
  })
  assert.deepEqual(calls[4]?.input, {
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedVersion: 1,
    operationId: OPERATION_ID,
  })
  assert.deepEqual(calls[5]?.input, {
    sender: trustedSender,
    snapshot: trustedSnapshot,
    documentMode: "declaration_content",
    invoiceKey: null,
  })
  assert.deepEqual(calls[6]?.input, {
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedVersion: 2,
    operationId: OPERATION_ID,
    providerCartId: PROVIDER_ID,
    providerShipmentId: PROVIDER_ID,
    providerCostCents: 1842,
  })
})

test("fails closed before any shipment/provider mutation when order or sender is missing", async () => {
  const module = await loadService()

  for (const scenario of ["order", "sender"] as const) {
    let writes = 0
    const service = module.createShipmentPreparationService(
      baseDeps({
        getOrder: async () => (scenario === "order" ? null : order()),
        getSenderProfile: async () => (scenario === "sender" ? null : sender()),
        createDraft: async () => {
          writes += 1
          return operationResult()
        },
        addToCart: async () => {
          writes += 1
          return { providerShipmentId: PROVIDER_ID, currentCostCents: 1842 }
        },
      }),
    )

    const result = await service.prepareAdminShipment({ orderId: ORDER_ID, adminUserId: ADMIN_ID })
    assert.equal(result.outcome, scenario === "order" ? "not_found" : "missing_sender")
    assert.equal(writes, 0)
  }
})

test("maps trusted snapshot failures, including wrong service/order state and multi-package data, without provider writes", async () => {
  const module = await loadService()

  for (const reason of [
    "order_not_ready",
    "shipping_snapshot_invalid",
    "multiple_packages_not_supported",
  ] as const) {
    let providerCalls = 0
    const service = module.createShipmentPreparationService(
      baseDeps({
        buildSnapshot: () => {
          throw new ShipmentSnapshotError(reason)
        },
        addToCart: async () => {
          providerCalls += 1
          return { providerShipmentId: PROVIDER_ID, currentCostCents: 1842 }
        },
      }),
    )

    assert.deepEqual(
      await service.prepareAdminShipment({ orderId: ORDER_ID, adminUserId: ADMIN_ID }),
      { outcome: "invalid_snapshot", reason },
    )
    assert.equal(providerCalls, 0)
  }
})

test("treats a conflicting/busy atomic prepare claim as harmless and never calls provider", async () => {
  const module = await loadService()
  let providerCalls = 0
  const service = module.createShipmentPreparationService(
    baseDeps({
      claimPrepare: async () =>
        operationResult({ outcome: "conflict", state: "draft", version: 1 }),
      addToCart: async () => {
        providerCalls += 1
        return { providerShipmentId: PROVIDER_ID, currentCostCents: 1842 }
      },
    }),
  )

  assert.deepEqual(
    await service.prepareAdminShipment({ orderId: ORDER_ID, adminUserId: ADMIN_ID }),
    { outcome: "busy", shipmentId: SHIPMENT_ID },
  )
  assert.equal(providerCalls, 0)
})

test("definite provider rejection and missing scope safely clear the prepare claim", async () => {
  const module = await loadService()

  for (const classification of ["definite_rejection", "unauthenticated"] as const) {
    const reverts: Record<string, unknown>[] = []
    const service = module.createShipmentPreparationService(
      baseDeps({
        addToCart: async () => {
          throw new MelhorEnvioShipmentProviderError(
            classification,
            classification === "definite_rejection" ? 422 : 401,
          )
        },
        revertPrepare: async (input) => {
          reverts.push(input)
          return operationResult({ previousState: "prepared", state: "prepared", version: 3 })
        },
      }),
    )

    const result = await service.prepareAdminShipment({ orderId: ORDER_ID, adminUserId: ADMIN_ID })
    assert.deepEqual(result, {
      outcome: classification === "unauthenticated" ? "reauthorization_required" : "provider_rejected",
      shipmentId: SHIPMENT_ID,
    })
    assert.deepEqual(reverts, [{
      shipmentId: SHIPMENT_ID,
      adminUserId: ADMIN_ID,
      expectedVersion: 2,
      operationId: OPERATION_ID,
    }])
  }
})

test("ambiguous cart result enters attention_required and is never blindly retried", async () => {
  const module = await loadService()
  let providerCalls = 0
  const attentions: Record<string, unknown>[] = []
  const service = module.createShipmentPreparationService(
    baseDeps({
      addToCart: async () => {
        providerCalls += 1
        throw new MelhorEnvioShipmentProviderError("outcome_unknown", null)
      },
      markAttention: async (input) => {
        attentions.push(input)
        return operationResult({ previousState: "prepared", state: "attention_required", version: 3 })
      },
    }),
  )

  assert.deepEqual(
    await service.prepareAdminShipment({ orderId: ORDER_ID, adminUserId: ADMIN_ID }),
    {
      outcome: "attention_required",
      shipmentId: SHIPMENT_ID,
      reason: "cart_outcome_unknown",
    },
  )
  assert.equal(providerCalls, 1)
  assert.deepEqual(attentions, [{
    shipmentId: SHIPMENT_ID,
    adminUserId: ADMIN_ID,
    expectedVersion: 2,
    operationId: OPERATION_ID,
    reason: "cart_outcome_unknown",
  }])
})

test("malformed provider success is treated as uncertain rather than creating a second cart item", async () => {
  const module = await loadService()
  let attentionCalls = 0
  const service = module.createShipmentPreparationService(
    baseDeps({
      addToCart: async () => {
        throw new MelhorEnvioShipmentProviderError("invalid_response", 200)
      },
      markAttention: async () => {
        attentionCalls += 1
        return operationResult({ previousState: "prepared", state: "attention_required", version: 3 })
      },
    }),
  )

  const result = await service.prepareAdminShipment({ orderId: ORDER_ID, adminUserId: ADMIN_ID })
  assert.equal(result.outcome, "attention_required")
  assert.equal(attentionCalls, 1)
})

test("rejects malformed trusted identifiers before storage/provider work", async () => {
  const module = await loadService()
  let calls = 0
  const service = module.createShipmentPreparationService(
    baseDeps({
      getOrder: async () => {
        calls += 1
        return order()
      },
    }),
  )

  for (const input of [
    { orderId: "bad-id", adminUserId: ADMIN_ID },
    { orderId: ORDER_ID, adminUserId: "bad-id" },
  ]) {
    await assert.rejects(() => service.prepareAdminShipment(input))
  }
  assert.equal(calls, 0)
})
