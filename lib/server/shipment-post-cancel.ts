import { randomUUID } from "node:crypto"
import { getMelhorEnvioShipmentEnv, type MelhorEnvioEnvironment } from "./env.ts"
import {
  cancelMelhorEnvioShipment,
  MelhorEnvioShipmentProviderError,
  readMelhorEnvioShipment,
  type ProviderShipmentState,
} from "./melhor-envio-shipment-client.ts"
import {
  getMelhorEnvioAccessToken,
  MelhorEnvioTokenManagerError,
} from "./melhor-envio-token-manager.ts"
import {
  claimShipmentCancel,
  commitShipmentCancel,
  confirmShipmentPosting,
  markShipmentAttention,
  resolveShipmentReconciliation,
  type ShipmentOperationResult,
} from "./shipment-operations.ts"
import { getShipmentById } from "./shipments.ts"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const POSTED_STATES = new Set(["posted", "in_transit", "delivered"])
const CANCELABLE_STATES = new Set(["purchased", "generated"])

interface PostCancelShipmentLike {
  id: string
  orderId: string
  environment: MelhorEnvioEnvironment
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

export type ShipmentPostCancelResult =
  | { outcome: "not_found" }
  | { outcome: "invalid_state"; shipmentId: string; orderId: string }
  | { outcome: "busy"; shipmentId: string; orderId: string }
  | { outcome: "posted"; shipmentId: string; orderId: string }
  | { outcome: "canceled"; shipmentId: string; orderId: string }
  | { outcome: "cancel_rejected"; shipmentId: string; orderId: string }
  | { outcome: "attention_required"; shipmentId: string; orderId: string }
  | { outcome: "reauthorization_required"; shipmentId: string; orderId: string }

export interface ShipmentPostCancelServiceDependencies {
  getConfig(): { environment: MelhorEnvioEnvironment }
  getShipment(shipmentId: string): Promise<PostCancelShipmentLike | null>
  confirmPosting(input: {
    shipmentId: string
    adminUserId: string
    expectedVersion: number
  }): Promise<ShipmentOperationResult>
  ensureCancelAuthorization(): Promise<void>
  claimCancel(input: {
    shipmentId: string
    adminUserId: string
    expectedVersion: number
    operationId: string
  }): Promise<ShipmentOperationResult>
  cancelProvider(input: {
    providerShipmentId: string
    description: string
  }): Promise<{ providerShipmentId: string; canceled: true }>
  readProvider(input: {
    providerShipmentId: string
    source: "order"
  }): Promise<ProviderShipmentState>
  commitCancel(input: {
    shipmentId: string
    adminUserId: string
    expectedVersion: number
    operationId: string
  }): Promise<ShipmentOperationResult>
  markAttention(input: {
    shipmentId: string
    adminUserId: string
    expectedVersion: number
    operationId: string
    reason: "cancel_outcome_unknown"
  }): Promise<ShipmentOperationResult>
  resolveReconciliation(input: {
    shipmentId: string
    adminUserId: string
    expectedVersion: number
    resolution: "canceled" | "not_canceled"
  }): Promise<ShipmentOperationResult>
  createOperationId(): string
}

function assertUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) throw new Error(`Invalid shipment ${label}`)
}

function isBoundToEnvironment(
  shipment: PostCancelShipmentLike,
  environment: MelhorEnvioEnvironment,
) {
  return (
    shipment.provider === "melhor_envio" &&
    shipment.environment === environment &&
    typeof shipment.providerShipmentId === "string" &&
    shipment.providerShipmentId.length > 0
  )
}

function isProviderCanceled(provider: ProviderShipmentState) {
  return provider.status?.trim().toLowerCase() === "canceled"
}

function isReauthorizationError(error: unknown) {
  return (
    (error instanceof MelhorEnvioTokenManagerError &&
      error.code === "reauthorization_required") ||
    (error instanceof MelhorEnvioShipmentProviderError &&
      error.classification === "unauthenticated")
  )
}

function stableCancelState(shipment: PostCancelShipmentLike) {
  return shipment.stableStateBeforeAttention === "purchased" ||
    shipment.stableStateBeforeAttention === "generated"
    ? shipment.stableStateBeforeAttention
    : null
}

function mappedMutationResult(
  mutation: ShipmentOperationResult,
  successState: string,
  successOutcome: "posted" | "canceled",
  shipment: PostCancelShipmentLike,
): ShipmentPostCancelResult {
  if (mutation.outcome === "not_found") return { outcome: "not_found" }
  if (mutation.outcome === "transitioned" && mutation.state === successState) {
    return {
      outcome: successOutcome,
      shipmentId: shipment.id,
      orderId: shipment.orderId,
    }
  }
  return {
    outcome: "busy",
    shipmentId: shipment.id,
    orderId: shipment.orderId,
  }
}

export function createShipmentPostCancelService(
  deps: ShipmentPostCancelServiceDependencies,
) {
  async function markCancelAttention(input: {
    shipment: PostCancelShipmentLike
    adminUserId: string
    expectedVersion: number
    operationId: string
    preferReauthorization?: boolean
  }): Promise<ShipmentPostCancelResult> {
    let marked: ShipmentOperationResult
    try {
      marked = await deps.markAttention({
        shipmentId: input.shipment.id,
        adminUserId: input.adminUserId,
        expectedVersion: input.expectedVersion,
        operationId: input.operationId,
        reason: "cancel_outcome_unknown",
      })
    } catch {
      return {
        outcome: "busy",
        shipmentId: input.shipment.id,
        orderId: input.shipment.orderId,
      }
    }

    if (marked.outcome === "not_found") return { outcome: "not_found" }
    if (
      marked.outcome !== "transitioned" ||
      marked.state !== "attention_required"
    ) {
      return {
        outcome: "busy",
        shipmentId: input.shipment.id,
        orderId: input.shipment.orderId,
      }
    }

    return {
      outcome: input.preferReauthorization
        ? "reauthorization_required"
        : "attention_required",
      shipmentId: input.shipment.id,
      orderId: input.shipment.orderId,
    }
  }

  async function reconcileClaimedCancellation(input: {
    shipment: PostCancelShipmentLike
    adminUserId: string
    expectedVersion: number
    operationId: string
  }): Promise<ShipmentPostCancelResult> {
    let provider: ProviderShipmentState
    try {
      provider = await deps.readProvider({
        providerShipmentId: input.shipment.providerShipmentId as string,
        source: "order",
      })
    } catch (error) {
      return markCancelAttention({
        ...input,
        preferReauthorization: isReauthorizationError(error),
      })
    }

    if (!isProviderCanceled(provider)) {
      return markCancelAttention(input)
    }

    let committed: ShipmentOperationResult
    try {
      committed = await deps.commitCancel({
        shipmentId: input.shipment.id,
        adminUserId: input.adminUserId,
        expectedVersion: input.expectedVersion,
        operationId: input.operationId,
      })
    } catch {
      return {
        outcome: "attention_required",
        shipmentId: input.shipment.id,
        orderId: input.shipment.orderId,
      }
    }

    return mappedMutationResult(
      committed,
      "canceled",
      "canceled",
      input.shipment,
    )
  }

  async function reconcileCancelAttention(input: {
    shipment: PostCancelShipmentLike
    adminUserId: string
  }): Promise<ShipmentPostCancelResult> {
    let provider: ProviderShipmentState
    try {
      provider = await deps.readProvider({
        providerShipmentId: input.shipment.providerShipmentId as string,
        source: "order",
      })
    } catch (error) {
      return {
        outcome: isReauthorizationError(error)
          ? "reauthorization_required"
          : "attention_required",
        shipmentId: input.shipment.id,
        orderId: input.shipment.orderId,
      }
    }

    if (!isProviderCanceled(provider)) {
      return {
        outcome: "attention_required",
        shipmentId: input.shipment.id,
        orderId: input.shipment.orderId,
      }
    }

    let resolved: ShipmentOperationResult
    try {
      resolved = await deps.resolveReconciliation({
        shipmentId: input.shipment.id,
        adminUserId: input.adminUserId,
        expectedVersion: input.shipment.version,
        resolution: "canceled",
      })
    } catch {
      return {
        outcome: "attention_required",
        shipmentId: input.shipment.id,
        orderId: input.shipment.orderId,
      }
    }

    return mappedMutationResult(
      resolved,
      "canceled",
      "canceled",
      input.shipment,
    )
  }

  async function postAdminShipment(input: {
    shipmentId: string
    adminUserId: string
  }): Promise<ShipmentPostCancelResult> {
    assertUuid(input.shipmentId, "identifier")
    assertUuid(input.adminUserId, "administrator")

    const config = deps.getConfig()
    const shipment = await deps.getShipment(input.shipmentId)
    if (!shipment) return { outcome: "not_found" }

    if (!isBoundToEnvironment(shipment, config.environment)) {
      return {
        outcome: "invalid_state",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
      }
    }

    if (
      POSTED_STATES.has(shipment.state) &&
      shipment.operationKind === null &&
      shipment.operationId === null
    ) {
      return {
        outcome: "posted",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
      }
    }

    if (
      shipment.state !== "generated" ||
      shipment.operationKind !== null ||
      shipment.operationId !== null
    ) {
      return {
        outcome: "invalid_state",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
      }
    }

    let confirmed: ShipmentOperationResult
    try {
      confirmed = await deps.confirmPosting({
        shipmentId: shipment.id,
        adminUserId: input.adminUserId,
        expectedVersion: shipment.version,
      })
    } catch {
      return {
        outcome: "busy",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
      }
    }

    return mappedMutationResult(confirmed, "posted", "posted", shipment)
  }

  async function cancelAdminShipment(input: {
    shipmentId: string
    adminUserId: string
    description: string
  }): Promise<ShipmentPostCancelResult> {
    assertUuid(input.shipmentId, "identifier")
    assertUuid(input.adminUserId, "administrator")
    if (
      typeof input.description !== "string" ||
      input.description !== input.description.trim() ||
      input.description.length < 3 ||
      input.description.length > 255
    ) {
      throw new Error("Invalid shipment cancellation description")
    }

    const config = deps.getConfig()
    const shipment = await deps.getShipment(input.shipmentId)
    if (!shipment) return { outcome: "not_found" }

    if (!isBoundToEnvironment(shipment, config.environment)) {
      return {
        outcome: "invalid_state",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
      }
    }

    if (
      shipment.state === "canceled" &&
      shipment.operationKind === null &&
      shipment.operationId === null
    ) {
      return {
        outcome: "canceled",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
      }
    }

    if (
      shipment.state === "attention_required" &&
      shipment.attentionReason === "cancel_outcome_unknown" &&
      stableCancelState(shipment) !== null &&
      shipment.operationKind === null &&
      shipment.operationId === null
    ) {
      return reconcileCancelAttention({
        shipment,
        adminUserId: input.adminUserId,
      })
    }

    if (shipment.state === "cancel_pending") {
      if (
        stableCancelState(shipment) === null ||
        shipment.operationKind !== "cancel" ||
        typeof shipment.operationId !== "string" ||
        !UUID_RE.test(shipment.operationId)
      ) {
        return {
          outcome: "invalid_state",
          shipmentId: shipment.id,
          orderId: shipment.orderId,
        }
      }
      return reconcileClaimedCancellation({
        shipment,
        adminUserId: input.adminUserId,
        expectedVersion: shipment.version,
        operationId: shipment.operationId,
      })
    }

    if (
      !CANCELABLE_STATES.has(shipment.state) ||
      shipment.operationKind !== null ||
      shipment.operationId !== null
    ) {
      return {
        outcome: "invalid_state",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
      }
    }

    try {
      await deps.ensureCancelAuthorization()
    } catch (error) {
      if (isReauthorizationError(error)) {
        return {
          outcome: "reauthorization_required",
          shipmentId: shipment.id,
          orderId: shipment.orderId,
        }
      }
      throw new Error("Shipment cancellation authorization failed")
    }

    const operationId = deps.createOperationId()
    assertUuid(operationId, "operation")

    let claim: ShipmentOperationResult
    try {
      claim = await deps.claimCancel({
        shipmentId: shipment.id,
        adminUserId: input.adminUserId,
        expectedVersion: shipment.version,
        operationId,
      })
    } catch {
      return {
        outcome: "busy",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
      }
    }

    if (claim.outcome === "not_found") return { outcome: "not_found" }
    if (
      claim.outcome !== "transitioned" ||
      claim.state !== "cancel_pending" ||
      typeof claim.version !== "number" ||
      !Number.isSafeInteger(claim.version) ||
      claim.version <= 0
    ) {
      return {
        outcome: "busy",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
      }
    }

    try {
      await deps.cancelProvider({
        providerShipmentId: shipment.providerShipmentId as string,
        description: input.description,
      })
    } catch (error) {
      if (
        error instanceof MelhorEnvioShipmentProviderError &&
        error.classification === "definite_rejection"
      ) {
        let resolved: ShipmentOperationResult
        try {
          resolved = await deps.resolveReconciliation({
            shipmentId: shipment.id,
            adminUserId: input.adminUserId,
            expectedVersion: claim.version,
            resolution: "not_canceled",
          })
        } catch {
          return {
            outcome: "busy",
            shipmentId: shipment.id,
            orderId: shipment.orderId,
          }
        }
        if (resolved.outcome === "not_found") return { outcome: "not_found" }
        if (
          resolved.outcome === "transitioned" &&
          (resolved.state === "purchased" || resolved.state === "generated")
        ) {
          return {
            outcome: "cancel_rejected",
            shipmentId: shipment.id,
            orderId: shipment.orderId,
          }
        }
        return {
          outcome: "busy",
          shipmentId: shipment.id,
          orderId: shipment.orderId,
        }
      }

      if (isReauthorizationError(error)) {
        return markCancelAttention({
          shipment,
          adminUserId: input.adminUserId,
          expectedVersion: claim.version,
          operationId,
          preferReauthorization: true,
        })
      }

      return reconcileClaimedCancellation({
        shipment,
        adminUserId: input.adminUserId,
        expectedVersion: claim.version,
        operationId,
      })
    }

    let committed: ShipmentOperationResult
    try {
      committed = await deps.commitCancel({
        shipmentId: shipment.id,
        adminUserId: input.adminUserId,
        expectedVersion: claim.version,
        operationId,
      })
    } catch {
      return {
        outcome: "attention_required",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
      }
    }

    return mappedMutationResult(committed, "canceled", "canceled", shipment)
  }

  return { postAdminShipment, cancelAdminShipment }
}

const defaultService = createShipmentPostCancelService({
  getConfig: () => {
    const env = getMelhorEnvioShipmentEnv()
    return { environment: env.environment }
  },
  getShipment: getShipmentById,
  confirmPosting: confirmShipmentPosting,
  ensureCancelAuthorization: async () => {
    await getMelhorEnvioAccessToken({
      requiredScopes: ["shipping-cancel", "orders-read"],
    })
  },
  claimCancel: claimShipmentCancel,
  cancelProvider: cancelMelhorEnvioShipment,
  readProvider: (input) => readMelhorEnvioShipment(input),
  commitCancel: commitShipmentCancel,
  markAttention: markShipmentAttention,
  resolveReconciliation: resolveShipmentReconciliation,
  createOperationId: randomUUID,
})

export const postAdminShipment = defaultService.postAdminShipment
export const cancelAdminShipment = defaultService.cancelAdminShipment
