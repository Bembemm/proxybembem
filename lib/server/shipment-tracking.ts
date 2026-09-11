import { createHash } from "node:crypto"
import { getMelhorEnvioShipmentEnv } from "./env.ts"
import {
  trackMelhorEnvioShipments,
  type ProviderTrackingResult,
} from "./melhor-envio-shipment-client.ts"
import { applyShipmentTrackingUpdate, type ShipmentOperationResult } from "./shipment-operations.ts"
import {
  getShipmentById,
  listActiveShipmentsForTracking,
  type ShipmentRecord,
} from "./shipments.ts"

// The provider client enforces the read-only shipping-tracking OAuth scope.
const MAX_TRACKING_BATCH = 20
const TRACKABLE_STATES = new Set(["purchased", "generated", "posted", "in_transit", "delivered"])
const STATE_RANK: Record<string, number> = {
  purchased: 0,
  generated: 0,
  posted: 1,
  in_transit: 2,
  delivered: 3,
}

type NormalizedTrackingStatus =
  | "pre_posting"
  | "posted"
  | "in_transit"
  | "delivered"
  | "canceled"
  | "unknown"

type TrackingShipment = Pick<
  ShipmentRecord,
  | "id"
  | "orderId"
  | "provider"
  | "environment"
  | "state"
  | "providerShipmentId"
  | "trackingCode"
  | "providerStatus"
  | "operationKind"
  | "operationId"
  | "version"
>

type TrackingResult = {
  outcome: "changed" | "unchanged" | "attention" | "not_found"
  shipmentId?: string
  orderId?: string
  normalizedStatus?: NormalizedTrackingStatus
}

type TrackingDependencies = {
  getConfig(): { environment: "production" | "sandbox" }
  getShipment(shipmentId: string): Promise<TrackingShipment | null>
  listActiveShipments(limit: number): Promise<TrackingShipment[]>
  trackProvider(input: { providerShipmentIds: string[] }): Promise<ProviderTrackingResult[]>
  applyTrackingUpdate(input: {
    shipmentId: string
    expectedVersion: number
    trackingState: "posted" | "in_transit" | "delivered"
    providerStatus: string
    trackingCode: string | null
    eventFingerprint: string
  }): Promise<ShipmentOperationResult>
}

export function normalizeMelhorEnvioTrackingStatus(status: string): NormalizedTrackingStatus {
  const normalized = status.trim().toLowerCase()
  switch (normalized) {
    case "pending":
    case "released":
      return "pre_posting"
    case "posted":
      return "posted"
    case "in_transit":
    case "in transit":
      return "in_transit"
    case "delivered":
      return "delivered"
    case "canceled":
      return "canceled"
    default:
      return "unknown"
  }
}

export function fingerprintTrackingEvent(input: {
  providerShipmentId: string
  providerStatus: string
  trackingCode: string | null
}): string {
  return createHash("sha256")
    .update(input.providerShipmentId)
    .update("\0")
    .update(input.providerStatus)
    .update("\0")
    .update(input.trackingCode ?? "")
    .digest("hex")
}

function safeIdentity(shipment: TrackingShipment, normalizedStatus: NormalizedTrackingStatus): TrackingResult {
  return {
    outcome: "unchanged",
    shipmentId: shipment.id,
    orderId: shipment.orderId,
    normalizedStatus,
  }
}

export function createShipmentTrackingService(deps: TrackingDependencies) {
  async function applyProviderTracking(
    shipment: TrackingShipment,
    provider: ProviderTrackingResult | undefined,
  ): Promise<TrackingResult> {
    if (!provider || provider.providerShipmentId !== shipment.providerShipmentId) {
      return {
        outcome: "attention",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
        normalizedStatus: "unknown",
      }
    }

    const normalizedStatus = normalizeMelhorEnvioTrackingStatus(provider.status)
    if (normalizedStatus === "pre_posting") return safeIdentity(shipment, normalizedStatus)
    if (normalizedStatus === "unknown" || normalizedStatus === "canceled") {
      return {
        outcome: "attention",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
        normalizedStatus,
      }
    }

    const currentRank = STATE_RANK[shipment.state]
    const targetRank = STATE_RANK[normalizedStatus]
    if (currentRank === undefined || targetRank < currentRank) {
      return safeIdentity(shipment, normalizedStatus)
    }

    if (
      currentRank === targetRank &&
      shipment.providerStatus === provider.status &&
      shipment.trackingCode === provider.trackingCode
    ) {
      return safeIdentity(shipment, normalizedStatus)
    }

    const result = await deps.applyTrackingUpdate({
      shipmentId: shipment.id,
      expectedVersion: shipment.version,
      trackingState: normalizedStatus,
      providerStatus: provider.status,
      trackingCode: provider.trackingCode,
      eventFingerprint: fingerprintTrackingEvent({
        providerShipmentId: provider.providerShipmentId,
        providerStatus: provider.status,
        trackingCode: provider.trackingCode,
      }),
    })

    if (result.outcome === "transitioned") {
      return {
        outcome: "changed",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
        normalizedStatus,
      }
    }
    if (result.outcome === "not_found") return { outcome: "not_found" }
    return safeIdentity(shipment, normalizedStatus)
  }

  async function refreshShipmentTracking(input: { shipmentId: string }): Promise<TrackingResult> {
    const shipment = await deps.getShipment(input.shipmentId)
    if (!shipment) return { outcome: "not_found" }

    const config = deps.getConfig()
    if (
      shipment.provider !== "melhor_envio" ||
      shipment.environment !== config.environment ||
      shipment.providerShipmentId === null ||
      shipment.operationKind !== null ||
      shipment.operationId !== null ||
      !TRACKABLE_STATES.has(shipment.state)
    ) {
      return {
        outcome: "attention",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
        normalizedStatus: "unknown",
      }
    }

    const results = await deps.trackProvider({ providerShipmentIds: [shipment.providerShipmentId] })
    return applyProviderTracking(
      shipment,
      results.find((entry) => entry.providerShipmentId === shipment.providerShipmentId),
    )
  }

  async function refreshActiveShipmentTrackingBatch(input: { limit: number }): Promise<{
    checked: number
    changed: number
    attention: number
  }> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > MAX_TRACKING_BATCH) {
      throw new Error("Invalid tracking batch")
    }

    const candidates = await deps.listActiveShipments(input.limit)
    if (candidates.length > input.limit || candidates.length > MAX_TRACKING_BATCH) {
      throw new Error("Invalid tracking batch")
    }
    if (candidates.length === 0) return { checked: 0, changed: 0, attention: 0 }

    const environment = deps.getConfig().environment
    const eligible = candidates.filter(
      (shipment) =>
        shipment.provider === "melhor_envio" &&
        shipment.environment === environment &&
        shipment.providerShipmentId !== null &&
        shipment.operationKind === null &&
        shipment.operationId === null &&
        TRACKABLE_STATES.has(shipment.state),
    )
    const providerIds = eligible.map((shipment) => shipment.providerShipmentId as string)
    const providerResults = providerIds.length > 0
      ? await deps.trackProvider({ providerShipmentIds: providerIds })
      : []
    const byProviderId = new Map(providerResults.map((result) => [result.providerShipmentId, result]))

    let changed = 0
    let attention = candidates.length - eligible.length
    for (const shipment of eligible) {
      const result = await applyProviderTracking(
        shipment,
        byProviderId.get(shipment.providerShipmentId as string),
      )
      if (result.outcome === "changed") changed += 1
      if (result.outcome === "attention") attention += 1
    }

    return { checked: candidates.length, changed, attention }
  }

  return { refreshShipmentTracking, refreshActiveShipmentTrackingBatch }
}

const defaultService = createShipmentTrackingService({
  getConfig: () => ({ environment: getMelhorEnvioShipmentEnv().environment }),
  getShipment: getShipmentById,
  listActiveShipments: listActiveShipmentsForTracking,
  trackProvider: trackMelhorEnvioShipments,
  applyTrackingUpdate: applyShipmentTrackingUpdate,
})

export const refreshShipmentTracking = defaultService.refreshShipmentTracking
export const refreshActiveShipmentTrackingBatch = defaultService.refreshActiveShipmentTrackingBatch
