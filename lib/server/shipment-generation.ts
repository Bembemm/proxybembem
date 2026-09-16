import { randomUUID } from "node:crypto"
import { getMelhorEnvioShipmentEnv, type MelhorEnvioEnvironment } from "./env.ts"
import {
  generateMelhorEnvioShipment,
  getMelhorEnvioDaceResource,
  getMelhorEnvioPrintResource,
  MelhorEnvioShipmentProviderError,
  readMelhorEnvioShipment,
  type ProviderShipmentState,
} from "./melhor-envio-shipment-client.ts"
import {
  getMelhorEnvioAccessToken,
  MelhorEnvioTokenManagerError,
} from "./melhor-envio-token-manager.ts"
import {
  claimShipmentGeneration,
  commitShipmentGeneration,
  type ShipmentOperationResult,
} from "./shipment-operations.ts"
import { getShipmentById } from "./shipments.ts"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const GENERATED_PROVIDER_STATUSES = new Set([
  "released",
  "posted",
  "delivered",
  "undelivered",
])
const PRINTABLE_LOCAL_STATES = new Set([
  "generated",
  "posted",
  "in_transit",
  "delivered",
])
const DACE_FORMATS = new Set(["pdf", "jpeg", "zpl"])

type DaceFormat = "pdf" | "jpeg" | "zpl"

interface GenerationShipmentLike {
  id: string
  orderId: string
  environment: MelhorEnvioEnvironment
  provider: "melhor_envio"
  documentMode: "declaration_content" | "invoice"
  state: string
  providerShipmentId: string | null
  operationKind: string | null
  operationId: string | null
  version: number
}

type PrintShipmentLike = GenerationShipmentLike

export type ShipmentGenerationActionResult =
  | { outcome: "not_found" }
  | { outcome: "invalid_state"; shipmentId: string; orderId: string }
  | { outcome: "busy"; shipmentId: string; orderId: string }
  | { outcome: "generated"; shipmentId: string; orderId: string }
  | { outcome: "generation_pending"; shipmentId: string; orderId: string }
  | { outcome: "provider_rejected"; shipmentId: string; orderId: string }
  | { outcome: "reauthorization_required"; shipmentId: string; orderId: string }

export type ShipmentPrintActionResult =
  | { outcome: "not_found" }
  | { outcome: "invalid_state"; shipmentId: string; orderId: string }
  | { outcome: "invalid_resource"; shipmentId: string; orderId: string }
  | { outcome: "provider_rejected"; shipmentId: string; orderId: string }
  | { outcome: "reauthorization_required"; shipmentId: string; orderId: string }
  | {
      outcome: "ready"
      shipmentId: string
      orderId: string
      url: string
    }

export interface ShipmentGenerationServiceDependencies {
  getConfig(): { environment: MelhorEnvioEnvironment }
  getShipment(shipmentId: string): Promise<GenerationShipmentLike | null>
  ensureAuthorization(): Promise<void>
  claimGeneration(input: {
    shipmentId: string
    adminUserId: string
    expectedVersion: number
    operationId: string
  }): Promise<ShipmentOperationResult>
  generate(input: { providerShipmentId: string }): Promise<{ accepted: true }>
  readProvider(input: {
    providerShipmentId: string
    source: "order"
  }): Promise<ProviderShipmentState>
  commitGeneration(input: {
    shipmentId: string
    adminUserId: string
    expectedVersion: number
    operationId: string
  }): Promise<ShipmentOperationResult>
  createOperationId(): string
}

export interface ShipmentPrintServiceDependencies {
  getConfig(): { environment: MelhorEnvioEnvironment }
  getShipment(shipmentId: string): Promise<PrintShipmentLike | null>
  getLabel(input: { providerShipmentId: string }): Promise<{ url: string }>
  getDace(input: {
    providerShipmentId: string
    format: DaceFormat
  }): Promise<{ url: string }>
}

function assertUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) throw new Error(`Invalid shipment ${label}`)
}

function isGeneratedProviderState(provider: ProviderShipmentState) {
  return (
    typeof provider.status === "string" &&
    GENERATED_PROVIDER_STATUSES.has(provider.status.trim().toLowerCase())
  )
}

function generationShipmentIsBoundToEnvironment(
  shipment: GenerationShipmentLike,
  environment: MelhorEnvioEnvironment,
) {
  return (
    shipment.provider === "melhor_envio" &&
    shipment.environment === environment &&
    typeof shipment.providerShipmentId === "string" &&
    shipment.providerShipmentId.length > 0
  )
}

function isTrustedMelhorEnvioResourceUrl(
  raw: string,
  environment: MelhorEnvioEnvironment,
) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }

  if (
    url.protocol !== "https:" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.port.length > 0
  ) {
    return false
  }

  const hostname = url.hostname.toLowerCase()
  const isSandboxHost =
    hostname === "sandbox.melhorenvio.com.br" ||
    hostname.endsWith(".sandbox.melhorenvio.com.br")

  if (environment === "sandbox") return isSandboxHost

  const isProductionHost =
    hostname === "melhorenvio.com.br" || hostname.endsWith(".melhorenvio.com.br")
  return isProductionHost && !isSandboxHost
}

function mapReadFailure(
  error: unknown,
  shipment: GenerationShipmentLike,
): ShipmentGenerationActionResult | null {
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
  if (
    error instanceof MelhorEnvioShipmentProviderError &&
    error.classification === "unauthenticated"
  ) {
    return {
      outcome: "reauthorization_required",
      shipmentId: shipment.id,
      orderId: shipment.orderId,
    }
  }
  return null
}

export function createShipmentGenerationService(
  deps: ShipmentGenerationServiceDependencies,
) {
  async function reconcileGeneration(input: {
    shipment: GenerationShipmentLike
    adminUserId: string
    operationId: string
    expectedVersion: number
  }): Promise<ShipmentGenerationActionResult> {
    let provider: ProviderShipmentState
    try {
      provider = await deps.readProvider({
        providerShipmentId: input.shipment.providerShipmentId as string,
        source: "order",
      })
    } catch (error) {
      const mapped = mapReadFailure(error, input.shipment)
      if (mapped) return mapped
      return {
        outcome: "generation_pending",
        shipmentId: input.shipment.id,
        orderId: input.shipment.orderId,
      }
    }

    if (!isGeneratedProviderState(provider)) {
      return {
        outcome: "generation_pending",
        shipmentId: input.shipment.id,
        orderId: input.shipment.orderId,
      }
    }

    let committed: ShipmentOperationResult
    try {
      committed = await deps.commitGeneration({
        shipmentId: input.shipment.id,
        adminUserId: input.adminUserId,
        expectedVersion: input.expectedVersion,
        operationId: input.operationId,
      })
    } catch {
      return {
        outcome: "generation_pending",
        shipmentId: input.shipment.id,
        orderId: input.shipment.orderId,
      }
    }

    if (committed.outcome === "not_found") return { outcome: "not_found" }
    if (committed.outcome !== "transitioned" || committed.state !== "generated") {
      return {
        outcome: "busy",
        shipmentId: input.shipment.id,
        orderId: input.shipment.orderId,
      }
    }

    return {
      outcome: "generated",
      shipmentId: input.shipment.id,
      orderId: input.shipment.orderId,
    }
  }

  async function generateAdminShipment(input: {
    shipmentId: string
    adminUserId: string
  }): Promise<ShipmentGenerationActionResult> {
    assertUuid(input.shipmentId, "identifier")
    assertUuid(input.adminUserId, "administrator")

    const config = deps.getConfig()
    const shipment = await deps.getShipment(input.shipmentId)
    if (!shipment) return { outcome: "not_found" }

    if (!generationShipmentIsBoundToEnvironment(shipment, config.environment)) {
      return {
        outcome: "invalid_state",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
      }
    }

    if (
      shipment.state === "generated" &&
      shipment.operationKind === null &&
      shipment.operationId === null
    ) {
      return {
        outcome: "generated",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
      }
    }

    if (shipment.state === "generation_pending") {
      if (
        shipment.operationKind !== "generation" ||
        typeof shipment.operationId !== "string" ||
        !UUID_RE.test(shipment.operationId)
      ) {
        return {
          outcome: "invalid_state",
          shipmentId: shipment.id,
          orderId: shipment.orderId,
        }
      }
      return reconcileGeneration({
        shipment,
        adminUserId: input.adminUserId,
        operationId: shipment.operationId,
        expectedVersion: shipment.version,
      })
    }

    if (
      shipment.state !== "purchased" ||
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
      await deps.ensureAuthorization()
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
      throw new Error("Shipment generation authorization failed")
    }

    const operationId = deps.createOperationId()
    assertUuid(operationId, "operation")
    const claim = await deps.claimGeneration({
      shipmentId: shipment.id,
      adminUserId: input.adminUserId,
      expectedVersion: shipment.version,
      operationId,
    })

    if (claim.outcome === "not_found") return { outcome: "not_found" }
    if (
      claim.outcome !== "transitioned" ||
      claim.state !== "generation_pending" ||
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
      await deps.generate({
        providerShipmentId: shipment.providerShipmentId as string,
      })
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
      if (
        error instanceof MelhorEnvioShipmentProviderError &&
        error.classification === "unauthenticated"
      ) {
        return {
          outcome: "reauthorization_required",
          shipmentId: shipment.id,
          orderId: shipment.orderId,
        }
      }
      // A timeout or provider rejection after the durable claim is not retried blindly.
      // Reconciliation below decides from the provider order state whether generation happened.
    }

    return reconcileGeneration({
      shipment,
      adminUserId: input.adminUserId,
      operationId,
      expectedVersion: claim.version,
    })
  }

  return { generateAdminShipment }
}

export function createShipmentPrintService(deps: ShipmentPrintServiceDependencies) {
  async function getAdminShipmentPrintResource(input: {
    shipmentId: string
    resource: "label" | "dace"
    format?: DaceFormat
  }): Promise<ShipmentPrintActionResult> {
    assertUuid(input.shipmentId, "identifier")
    if (input.resource !== "label" && input.resource !== "dace") {
      throw new Error("Invalid shipment print resource")
    }

    const format = input.format ?? "pdf"
    if (!DACE_FORMATS.has(format)) throw new Error("Invalid shipment DACE format")

    const config = deps.getConfig()
    const shipment = await deps.getShipment(input.shipmentId)
    if (!shipment) return { outcome: "not_found" }

    if (
      !generationShipmentIsBoundToEnvironment(shipment, config.environment) ||
      !PRINTABLE_LOCAL_STATES.has(shipment.state) ||
      shipment.operationKind !== null ||
      shipment.operationId !== null ||
      (input.resource === "dace" && shipment.documentMode !== "declaration_content")
    ) {
      return {
        outcome: "invalid_state",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
      }
    }

    let resource: { url: string }
    try {
      resource =
        input.resource === "label"
          ? await deps.getLabel({
              providerShipmentId: shipment.providerShipmentId as string,
            })
          : await deps.getDace({
              providerShipmentId: shipment.providerShipmentId as string,
              format,
            })
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
      if (error instanceof MelhorEnvioShipmentProviderError) {
        if (error.classification === "unauthenticated") {
          return {
            outcome: "reauthorization_required",
            shipmentId: shipment.id,
            orderId: shipment.orderId,
          }
        }
        return {
          outcome: "provider_rejected",
          shipmentId: shipment.id,
          orderId: shipment.orderId,
        }
      }
      throw new Error("Shipment print resource failed")
    }

    if (
      typeof resource.url !== "string" ||
      !isTrustedMelhorEnvioResourceUrl(resource.url, config.environment)
    ) {
      return {
        outcome: "invalid_resource",
        shipmentId: shipment.id,
        orderId: shipment.orderId,
      }
    }

    return {
      outcome: "ready",
      shipmentId: shipment.id,
      orderId: shipment.orderId,
      url: resource.url,
    }
  }

  return { getAdminShipmentPrintResource }
}

const defaultGenerationService = createShipmentGenerationService({
  getConfig: () => {
    const env = getMelhorEnvioShipmentEnv()
    return { environment: env.environment }
  },
  getShipment: getShipmentById,
  ensureAuthorization: async () => {
    await getMelhorEnvioAccessToken({
      requiredScopes: ["shipping-generate", "orders-read"],
    })
  },
  claimGeneration: claimShipmentGeneration,
  generate: generateMelhorEnvioShipment,
  readProvider: (input) => readMelhorEnvioShipment(input),
  commitGeneration: commitShipmentGeneration,
  createOperationId: randomUUID,
})

const defaultPrintService = createShipmentPrintService({
  getConfig: () => {
    const env = getMelhorEnvioShipmentEnv()
    return { environment: env.environment }
  },
  getShipment: getShipmentById,
  getLabel: getMelhorEnvioPrintResource,
  getDace: getMelhorEnvioDaceResource,
})

export const generateAdminShipment = defaultGenerationService.generateAdminShipment
export const getAdminShipmentPrintResource =
  defaultPrintService.getAdminShipmentPrintResource
