import { randomUUID } from "node:crypto"
import type { AdminOrderDetail } from "./admin-orders.ts"
import { getAdminOrderById } from "./admin-orders.ts"
import {
  getMelhorEnvioOAuthEnv,
  getMelhorEnvioShipmentEnv,
  type MelhorEnvioEnvironment,
} from "./env.ts"
import {
  addShipmentToMelhorEnvioCart,
  MelhorEnvioShipmentProviderError,
  purchaseMelhorEnvioShipment,
  readMelhorEnvioShipment,
  type ProviderShipmentState,
} from "./melhor-envio-shipment-client.ts"
import { MelhorEnvioTokenManagerError } from "./melhor-envio-token-manager.ts"
import {
  claimShipmentPrepare,
  claimShipmentPurchase,
  commitShipmentCart,
  commitShipmentPurchase,
  createShipmentDraft,
  markShipmentAttention,
  resolveShipmentReconciliation,
  revertShipmentPrepare,
  revertShipmentPurchase,
  type ShipmentOperationResult,
} from "./shipment-operations.ts"
import {
  buildShipmentPreparationSnapshot,
  ShipmentSnapshotError,
  type ShipmentPreparationSnapshot,
} from "./shipment-snapshot.ts"
import {
  getActiveShipmentForOrder,
  getShipmentById,
} from "./shipments.ts"
import {
  getShippingSenderProfile,
  type ShippingSenderProfile,
} from "./shipping-sender.ts"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ShipmentActionResult =
  | { outcome: "prepared"; shipmentId: string; providerCostCents: number }
  | { outcome: "not_found" }
  | { outcome: "missing_sender" }
  | { outcome: "invalid_snapshot"; reason: string }
  | { outcome: "busy"; shipmentId: string }
  | { outcome: "provider_rejected"; shipmentId: string }
  | { outcome: "reauthorization_required"; shipmentId: string }
  | {
      outcome: "attention_required"
      shipmentId: string
      reason: "cart_outcome_unknown"
    }

export type ShipmentPurchaseActionResult =
  | { outcome: "purchase_disabled" }
  | { outcome: "not_found" }
  | { outcome: "invalid_state"; shipmentId: string; orderId: string }
  | { outcome: "busy"; shipmentId: string; orderId: string }
  | {
      outcome: "price_changed"
      shipmentId: string
      orderId: string
      providerCostCents: number
    }
  | {
      outcome: "purchased"
      shipmentId: string
      orderId: string
      purchasedCostCents: number
    }
  | { outcome: "provider_rejected"; shipmentId: string; orderId: string }
  | { outcome: "reauthorization_required"; shipmentId: string; orderId: string }
  | {
      outcome: "attention_required"
      shipmentId: string
      orderId: string
      reason: "purchase_outcome_unknown"
    }
  | {
      outcome: "reconciled_purchased"
      shipmentId: string
      orderId: string
      purchasedCostCents: number
    }
  | { outcome: "reconciled_not_purchased"; shipmentId: string; orderId: string }

interface ActiveShipmentLike {
  id: string
  orderId: string
  state: string
  version: number
  operationKind: string | null
  operationId: string | null
  senderProfileId?: string
  senderProfileVersion?: number
  environment?: string
  serviceId?: string
  serviceName?: string
  carrierName?: string
}

interface PurchaseShipmentLike {
  id: string
  orderId: string
  environment: MelhorEnvioEnvironment
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

export interface ShipmentPreparationServiceDependencies {
  getConfig(): { environment: MelhorEnvioEnvironment; originCep: string }
  getOrder(orderId: string): Promise<AdminOrderDetail | null>
  getSenderProfile(
    environment: MelhorEnvioEnvironment,
    personType: "pf" | "pj",
  ): Promise<ShippingSenderProfile | null>
  getActiveShipment(orderId: string): Promise<ActiveShipmentLike | null>
  buildSnapshot(input: {
    order: AdminOrderDetail
    sender: ShippingSenderProfile
    expectedOriginCep: string
  }): ShipmentPreparationSnapshot
  createDraft(input: Parameters<typeof createShipmentDraft>[0]): Promise<ShipmentOperationResult>
  claimPrepare(input: Parameters<typeof claimShipmentPrepare>[0]): Promise<ShipmentOperationResult>
  commitCart(input: Parameters<typeof commitShipmentCart>[0]): Promise<ShipmentOperationResult>
  revertPrepare(input: Parameters<typeof revertShipmentPrepare>[0]): Promise<ShipmentOperationResult>
  markAttention(input: Parameters<typeof markShipmentAttention>[0]): Promise<ShipmentOperationResult>
  addToCart(input: Parameters<typeof addShipmentToMelhorEnvioCart>[0]): ReturnType<typeof addShipmentToMelhorEnvioCart>
  createOperationId(): string
}

export interface ShipmentPurchaseServiceDependencies {
  getConfig(): {
    environment: MelhorEnvioEnvironment
    labelPurchaseEnabled: boolean
  }
  getShipment(shipmentId: string): Promise<PurchaseShipmentLike | null>
  readProvider(input: {
    providerShipmentId: string
    source: "cart" | "order"
  }): Promise<ProviderShipmentState>
  claimPurchase(input: Parameters<typeof claimShipmentPurchase>[0]): Promise<ShipmentOperationResult>
  checkout(input: Parameters<typeof purchaseMelhorEnvioShipment>[0]): ReturnType<typeof purchaseMelhorEnvioShipment>
  commitPurchase(input: Parameters<typeof commitShipmentPurchase>[0]): Promise<ShipmentOperationResult>
  revertPurchase(input: Parameters<typeof revertShipmentPurchase>[0]): Promise<ShipmentOperationResult>
  markAttention(input: Parameters<typeof markShipmentAttention>[0]): Promise<ShipmentOperationResult>
  resolveReconciliation(input: Parameters<typeof resolveShipmentReconciliation>[0]): Promise<ShipmentOperationResult>
  createOperationId(): string
}

function assertUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) throw new Error(`Invalid shipment ${label}`)
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

function senderSnapshot(sender: ShippingSenderProfile) {
  return {
    personType: sender.personType,
    fullName: sender.fullName,
    cpf: sender.cpf,
    cnpj: sender.cnpj,
    stateRegister: sender.stateRegister,
    economicActivityCode: sender.economicActivityCode,
    email: sender.email,
    phone: sender.phone,
    postalCode: sender.postalCode,
    street: sender.street,
    number: sender.number,
    complement: sender.complement,
    neighborhood: sender.neighborhood,
    city: sender.city,
    state: sender.state,
  }
}

function activeShipmentMatchesTrustedInputs(input: {
  shipment: ActiveShipmentLike
  orderId: string
  sender: ShippingSenderProfile
  environment: MelhorEnvioEnvironment
  snapshot: ShipmentPreparationSnapshot
}) {
  const { shipment, orderId, sender, environment, snapshot } = input
  if (shipment.orderId !== orderId) return false
  if (shipment.operationKind !== null || shipment.operationId !== null) return false
  if (shipment.state !== "draft" && shipment.state !== "prepared") return false

  if (
    shipment.senderProfileId !== undefined &&
    shipment.senderProfileId !== sender.id
  ) return false
  if (
    shipment.senderProfileVersion !== undefined &&
    shipment.senderProfileVersion !== sender.version
  ) return false
  if (shipment.environment !== undefined && shipment.environment !== environment) return false
  if (shipment.serviceId !== undefined && shipment.serviceId !== snapshot.service.id) return false
  if (shipment.serviceName !== undefined && shipment.serviceName !== snapshot.service.name) return false
  if (shipment.carrierName !== undefined && shipment.carrierName !== snapshot.service.carrier) return false
  return true
}

function isClaimBusy(result: ShipmentOperationResult) {
  return (
    result.outcome === "conflict" ||
    result.outcome === "invalid_state" ||
    result.outcome === "operation_mismatch" ||
    result.outcome === "active_exists"
  )
}

export function createShipmentPreparationService(
  deps: ShipmentPreparationServiceDependencies,
) {
  async function enterCartAttention(input: {
    shipmentId: string
    adminUserId: string
    expectedVersion: number
    operationId: string
  }): Promise<ShipmentActionResult> {
    await deps.markAttention({
      ...input,
      reason: "cart_outcome_unknown",
    })
    return {
      outcome: "attention_required",
      shipmentId: input.shipmentId,
      reason: "cart_outcome_unknown",
    }
  }

  async function clearPrepareClaim(input: {
    shipmentId: string
    adminUserId: string
    expectedVersion: number
    operationId: string
  }) {
    await deps.revertPrepare(input)
  }

  async function prepareAdminShipment(input: {
    orderId: string
    adminUserId: string
  }): Promise<ShipmentActionResult> {
    assertUuid(input.orderId, "order")
    assertUuid(input.adminUserId, "administrator")

    const config = deps.getConfig()
    const order = await deps.getOrder(input.orderId)
    if (!order) return { outcome: "not_found" }

    const sender = await deps.getSenderProfile(config.environment, "pf")
    if (
      !sender ||
      sender.personType !== "pf" ||
      sender.environment !== config.environment ||
      typeof sender.cpf !== "string"
    ) {
      return { outcome: "missing_sender" }
    }

    let snapshot: ShipmentPreparationSnapshot
    try {
      snapshot = deps.buildSnapshot({
        order,
        sender,
        expectedOriginCep: config.originCep,
      })
    } catch (error) {
      if (error instanceof ShipmentSnapshotError) {
        return { outcome: "invalid_snapshot", reason: error.code }
      }
      throw error
    }

    const active = await deps.getActiveShipment(input.orderId)
    let shipmentId: string
    let draftVersion: number

    if (active) {
      if (
        !activeShipmentMatchesTrustedInputs({
          shipment: active,
          orderId: input.orderId,
          sender,
          environment: config.environment,
          snapshot,
        })
      ) {
        return { outcome: "busy", shipmentId: active.id }
      }
      shipmentId = active.id
      draftVersion = active.version
    } else {
      const draft = await deps.createDraft({
        orderId: input.orderId,
        adminUserId: input.adminUserId,
        senderProfileId: sender.id,
        senderProfileVersion: sender.version,
        environment: config.environment,
        documentMode: "declaration_content",
        invoiceKey: null,
        serviceId: snapshot.service.id,
        serviceName: snapshot.service.name,
        carrierName: snapshot.service.carrier,
        customerShippingCents: snapshot.customerShippingCents,
        recipientSnapshot: snapshot.recipient,
        senderSnapshot: senderSnapshot(sender),
        packageSnapshot: snapshot.package,
        declarationItemsSnapshot: snapshot.declarationItems,
      })

      if (draft.outcome === "not_found") return { outcome: "not_found" }
      if (draft.outcome === "active_exists") {
        if (!draft.shipmentId) throw new Error("Shipment preparation failed")
        return { outcome: "busy", shipmentId: draft.shipmentId }
      }
      if (draft.outcome !== "created" || !draft.shipmentId || !draft.version) {
        if (draft.shipmentId && isClaimBusy(draft)) {
          return { outcome: "busy", shipmentId: draft.shipmentId }
        }
        throw new Error("Shipment preparation failed")
      }
      shipmentId = draft.shipmentId
      draftVersion = draft.version
    }

    assertUuid(shipmentId, "identifier")
    const operationId = deps.createOperationId()
    assertUuid(operationId, "operation")

    const claim = await deps.claimPrepare({
      shipmentId,
      adminUserId: input.adminUserId,
      expectedVersion: draftVersion,
      operationId,
    })

    if (claim.outcome === "not_found") return { outcome: "not_found" }
    if (
      isClaimBusy(claim) ||
      claim.outcome !== "transitioned" ||
      claim.state !== "prepared" ||
      !claim.version
    ) {
      return { outcome: "busy", shipmentId }
    }

    const claimedVersion = claim.version
    let provider: { providerShipmentId: string; currentCostCents: number }
    try {
      provider = await deps.addToCart({
        sender,
        snapshot,
        documentMode: "declaration_content",
        invoiceKey: null,
      })
    } catch (error) {
      const mutation = {
        shipmentId,
        adminUserId: input.adminUserId,
        expectedVersion: claimedVersion,
        operationId,
      }

      if (error instanceof MelhorEnvioTokenManagerError) {
        await clearPrepareClaim(mutation)
        if (error.code === "reauthorization_required") {
          return { outcome: "reauthorization_required", shipmentId }
        }
        throw new Error("Shipment preparation failed")
      }

      if (error instanceof MelhorEnvioShipmentProviderError) {
        if (error.classification === "definite_rejection") {
          await clearPrepareClaim(mutation)
          return { outcome: "provider_rejected", shipmentId }
        }
        if (error.classification === "unauthenticated") {
          await clearPrepareClaim(mutation)
          return { outcome: "reauthorization_required", shipmentId }
        }
        return enterCartAttention(mutation)
      }

      return enterCartAttention(mutation)
    }

    try {
      const committed = await deps.commitCart({
        shipmentId,
        adminUserId: input.adminUserId,
        expectedVersion: claimedVersion,
        operationId,
        providerCartId: provider.providerShipmentId,
        providerShipmentId: provider.providerShipmentId,
        providerCostCents: provider.currentCostCents,
      })

      if (
        committed.outcome !== "transitioned" ||
        committed.state !== "in_cart"
      ) {
        return enterCartAttention({
          shipmentId,
          adminUserId: input.adminUserId,
          expectedVersion: claimedVersion,
          operationId,
        })
      }
    } catch {
      return enterCartAttention({
        shipmentId,
        adminUserId: input.adminUserId,
        expectedVersion: claimedVersion,
        operationId,
      })
    }

    return {
      outcome: "prepared",
      shipmentId,
      providerCostCents: provider.currentCostCents,
    }
  }

  return { prepareAdminShipment }
}

function purchaseStateIsEligible(
  shipment: PurchaseShipmentLike,
  environment: MelhorEnvioEnvironment,
) {
  return (
    shipment.provider === "melhor_envio" &&
    shipment.environment === environment &&
    shipment.state === "in_cart" &&
    shipment.operationKind === null &&
    shipment.operationId === null &&
    typeof shipment.providerShipmentId === "string" &&
    shipment.providerShipmentId.length > 0
  )
}

function reconciliationStateIsEligible(
  shipment: PurchaseShipmentLike,
  environment: MelhorEnvioEnvironment,
) {
  return (
    shipment.provider === "melhor_envio" &&
    shipment.environment === environment &&
    shipment.state === "attention_required" &&
    shipment.stableStateBeforeAttention === "in_cart" &&
    shipment.attentionReason === "purchase_outcome_unknown" &&
    shipment.operationKind === null &&
    shipment.operationId === null &&
    typeof shipment.providerShipmentId === "string" &&
    shipment.providerShipmentId.length > 0
  )
}

export function createShipmentPurchaseService(
  deps: ShipmentPurchaseServiceDependencies,
) {
  async function revertPurchaseClaim(input: {
    shipmentId: string
    adminUserId: string
    expectedVersion: number
    operationId: string
  }) {
    await deps.revertPurchase(input)
  }

  async function enterPurchaseAttention(input: {
    shipmentId: string
    orderId: string
    adminUserId: string
    expectedVersion: number
    operationId: string
  }): Promise<ShipmentPurchaseActionResult> {
    try {
      await deps.markAttention({
        shipmentId: input.shipmentId,
        adminUserId: input.adminUserId,
        expectedVersion: input.expectedVersion,
        operationId: input.operationId,
        reason: "purchase_outcome_unknown",
      })
    } catch {
      // The provider checkout must never be retried merely because local persistence is uncertain.
    }
    return {
      outcome: "attention_required",
      shipmentId: input.shipmentId,
      orderId: input.orderId,
      reason: "purchase_outcome_unknown",
    }
  }

  function unavailablePurchaseRead(
    error: unknown,
    shipment: PurchaseShipmentLike,
  ): ShipmentPurchaseActionResult | null {
    if (error instanceof MelhorEnvioTokenManagerError) {
      if (error.code === "reauthorization_required") {
        return {
          outcome: "reauthorization_required",
          shipmentId: shipment.id,
          orderId: shipment.orderId,
        }
      }
      return null
    }
    if (error instanceof MelhorEnvioShipmentProviderError) {
      if (error.classification === "unauthenticated") {
        return {
          outcome: "reauthorization_required",
          shipmentId: shipment.id,
          orderId: shipment.orderId,
        }
      }
      if (error.classification === "definite_rejection") {
        return {
          outcome: "provider_rejected",
          shipmentId: shipment.id,
          orderId: shipment.orderId,
        }
      }
    }
    return null
  }

  async function purchaseAdminShipment(input: {
    shipmentId: string
    adminUserId: string
    expectedCostCents: number
  }): Promise<ShipmentPurchaseActionResult> {
    assertUuid(input.shipmentId, "identifier")
    assertUuid(input.adminUserId, "administrator")
    if (!isPositiveSafeInteger(input.expectedCostCents)) {
      throw new Error("Invalid shipment confirmed cost")
    }

    const config = deps.getConfig()
    if (!config.labelPurchaseEnabled) {
      return { outcome: "purchase_disabled" }
    }

    const shipment = await deps.getShipment(input.shipmentId)
    if (!shipment) return { outcome: "not_found" }
    if (!purchaseStateIsEligible(shipment, config.environment)) {
      return {
        outcome: "invalid_state",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
      }
    }

    let providerState: ProviderShipmentState
    try {
      providerState = await deps.readProvider({
        providerShipmentId: shipment.providerShipmentId as string,
        source: "cart",
      })
    } catch (error) {
      const mapped = unavailablePurchaseRead(error, shipment)
      if (mapped) return mapped
      throw new Error("Shipment purchase preflight failed")
    }

    if (!isPositiveSafeInteger(providerState.priceCents)) {
      throw new Error("Shipment purchase preflight failed")
    }
    if (providerState.priceCents !== input.expectedCostCents) {
      return {
        outcome: "price_changed",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
        providerCostCents: providerState.priceCents,
      }
    }

    const operationId = deps.createOperationId()
    assertUuid(operationId, "operation")
    const claim = await deps.claimPurchase({
      shipmentId: shipment.id,
      adminUserId: input.adminUserId,
      expectedVersion: shipment.version,
      operationId,
    })
    if (claim.outcome === "not_found") return { outcome: "not_found" }
    if (
      claim.outcome !== "transitioned" ||
      claim.state !== "purchase_pending" ||
      !claim.version
    ) {
      return { outcome: "busy", shipmentId: shipment.id, orderId: shipment.orderId }
    }

    const mutation = {
      shipmentId: shipment.id,
      adminUserId: input.adminUserId,
      expectedVersion: claim.version,
      operationId,
    }

    let purchase: { providerOrderId: string; purchasedCostCents: number }
    try {
      purchase = await deps.checkout({
        providerShipmentId: shipment.providerShipmentId as string,
        currentCostCents: providerState.priceCents,
      })
    } catch (error) {
      if (error instanceof MelhorEnvioTokenManagerError) {
        await revertPurchaseClaim(mutation)
        if (error.code === "reauthorization_required") {
          return {
            outcome: "reauthorization_required",
            shipmentId: shipment.id,
            orderId: shipment.orderId,
          }
        }
        throw new Error("Shipment purchase failed")
      }
      if (error instanceof MelhorEnvioShipmentProviderError) {
        if (error.classification === "definite_rejection") {
          await revertPurchaseClaim(mutation)
          return {
            outcome: "provider_rejected",
            shipmentId: shipment.id,
            orderId: shipment.orderId,
          }
        }
        if (error.classification === "unauthenticated") {
          await revertPurchaseClaim(mutation)
          return {
            outcome: "reauthorization_required",
            shipmentId: shipment.id,
            orderId: shipment.orderId,
          }
        }
      }
      return enterPurchaseAttention({
        ...mutation,
        orderId: shipment.orderId,
      })
    }

    if (
      !isPositiveSafeInteger(purchase.purchasedCostCents) ||
      purchase.purchasedCostCents !== providerState.priceCents ||
      typeof purchase.providerOrderId !== "string" ||
      purchase.providerOrderId.length < 1
    ) {
      return enterPurchaseAttention({
        ...mutation,
        orderId: shipment.orderId,
      })
    }

    try {
      const committed = await deps.commitPurchase({
        ...mutation,
        providerOrderId: purchase.providerOrderId,
        purchasedCostCents: purchase.purchasedCostCents,
      })
      if (committed.outcome !== "transitioned" || committed.state !== "purchased") {
        return enterPurchaseAttention({
          ...mutation,
          orderId: shipment.orderId,
        })
      }
    } catch {
      return enterPurchaseAttention({
        ...mutation,
        orderId: shipment.orderId,
      })
    }

    return {
      outcome: "purchased",
      shipmentId: shipment.id,
      orderId: shipment.orderId,
      purchasedCostCents: purchase.purchasedCostCents,
    }
  }

  async function reconcileAdminShipmentPurchase(input: {
    shipmentId: string
    adminUserId: string
  }): Promise<ShipmentPurchaseActionResult> {
    assertUuid(input.shipmentId, "identifier")
    assertUuid(input.adminUserId, "administrator")

    const config = deps.getConfig()
    const shipment = await deps.getShipment(input.shipmentId)
    if (!shipment) return { outcome: "not_found" }
    if (!reconciliationStateIsEligible(shipment, config.environment)) {
      return {
        outcome: "invalid_state",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
      }
    }

    const providerShipmentId = shipment.providerShipmentId as string
    let providerOrder: ProviderShipmentState | null = null
    let orderConfirmedAbsent = false

    try {
      providerOrder = await deps.readProvider({ providerShipmentId, source: "order" })
    } catch (error) {
      if (error instanceof MelhorEnvioTokenManagerError) {
        if (error.code === "reauthorization_required") {
          return {
            outcome: "reauthorization_required",
            shipmentId: shipment.id,
            orderId: shipment.orderId,
          }
        }
        return {
          outcome: "attention_required",
          shipmentId: shipment.id,
          orderId: shipment.orderId,
          reason: "purchase_outcome_unknown",
        }
      }
      if (
        error instanceof MelhorEnvioShipmentProviderError &&
        error.classification === "definite_rejection" &&
        error.status === 404
      ) {
        orderConfirmedAbsent = true
      } else {
        return {
          outcome: "attention_required",
          shipmentId: shipment.id,
          orderId: shipment.orderId,
          reason: "purchase_outcome_unknown",
        }
      }
    }

    if (providerOrder) {
      const purchasedCostCents = providerOrder.priceCents ?? shipment.providerCostCents
      if (!isPositiveSafeInteger(purchasedCostCents)) {
        return {
          outcome: "attention_required",
          shipmentId: shipment.id,
          orderId: shipment.orderId,
          reason: "purchase_outcome_unknown",
        }
      }
      const resolved = await deps.resolveReconciliation({
        shipmentId: shipment.id,
        adminUserId: input.adminUserId,
        expectedVersion: shipment.version,
        resolution: "purchased",
        providerOrderId: providerShipmentId,
        purchasedCostCents,
      })
      if (resolved.outcome !== "transitioned" || resolved.state !== "purchased") {
        return { outcome: "busy", shipmentId: shipment.id, orderId: shipment.orderId }
      }
      return {
        outcome: "reconciled_purchased",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
        purchasedCostCents,
      }
    }

    if (!orderConfirmedAbsent) {
      return {
        outcome: "attention_required",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
        reason: "purchase_outcome_unknown",
      }
    }

    try {
      await deps.readProvider({ providerShipmentId, source: "cart" })
    } catch (error) {
      if (
        error instanceof MelhorEnvioTokenManagerError &&
        error.code === "reauthorization_required"
      ) {
        return {
          outcome: "reauthorization_required",
          shipmentId: shipment.id,
          orderId: shipment.orderId,
        }
      }
      return {
        outcome: "attention_required",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
        reason: "purchase_outcome_unknown",
      }
    }

    const resolved = await deps.resolveReconciliation({
      shipmentId: shipment.id,
      adminUserId: input.adminUserId,
      expectedVersion: shipment.version,
      resolution: "not_purchased",
      providerOrderId: null,
      purchasedCostCents: null,
    })
    if (resolved.outcome !== "transitioned" || resolved.state !== "in_cart") {
      return { outcome: "busy", shipmentId: shipment.id, orderId: shipment.orderId }
    }
    return {
      outcome: "reconciled_not_purchased",
      shipmentId: shipment.id,
      orderId: shipment.orderId,
    }
  }

  return { purchaseAdminShipment, reconcileAdminShipmentPurchase }
}

const defaultPreparationService = createShipmentPreparationService({
  getConfig: () => {
    const env = getMelhorEnvioOAuthEnv()
    return { environment: env.environment, originCep: env.originCep }
  },
  getOrder: getAdminOrderById,
  getSenderProfile: getShippingSenderProfile,
  getActiveShipment: getActiveShipmentForOrder,
  buildSnapshot: ({ order, sender, expectedOriginCep }) => {
    if (sender.personType !== "pf" || typeof sender.cpf !== "string") {
      throw new Error("Shipping sender profile is unavailable")
    }
    return buildShipmentPreparationSnapshot({
      order,
      sender: {
        id: sender.id,
        environment: sender.environment,
        fullName: sender.fullName,
        cpf: sender.cpf,
        email: sender.email,
        phone: sender.phone,
        postalCode: sender.postalCode,
        street: sender.street,
        number: sender.number,
        complement: sender.complement,
        neighborhood: sender.neighborhood,
        city: sender.city,
        state: sender.state,
        version: sender.version,
        updatedAt: sender.updatedAt,
      },
      expectedOriginCep,
    })
  },
  createDraft: createShipmentDraft,
  claimPrepare: claimShipmentPrepare,
  commitCart: commitShipmentCart,
  revertPrepare: revertShipmentPrepare,
  markAttention: markShipmentAttention,
  addToCart: addShipmentToMelhorEnvioCart,
  createOperationId: randomUUID,
})

const defaultPurchaseService = createShipmentPurchaseService({
  getConfig: () => {
    const env = getMelhorEnvioShipmentEnv()
    return {
      environment: env.environment,
      labelPurchaseEnabled: env.labelPurchaseEnabled,
    }
  },
  getShipment: getShipmentById,
  readProvider: readMelhorEnvioShipment,
  claimPurchase: claimShipmentPurchase,
  checkout: purchaseMelhorEnvioShipment,
  commitPurchase: commitShipmentPurchase,
  revertPurchase: revertShipmentPurchase,
  markAttention: markShipmentAttention,
  resolveReconciliation: resolveShipmentReconciliation,
  createOperationId: randomUUID,
})

export const prepareAdminShipment = defaultPreparationService.prepareAdminShipment
export const purchaseAdminShipment = defaultPurchaseService.purchaseAdminShipment
export const reconcileAdminShipmentPurchase =
  defaultPurchaseService.reconcileAdminShipmentPurchase
