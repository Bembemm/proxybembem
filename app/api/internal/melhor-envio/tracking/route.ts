import { getCronSecret } from "../../../../../lib/server/env.ts"
import { createMelhorEnvioTrackingHandler } from "../../../../../lib/server/melhor-envio-tracking-handler.ts"
import { refreshActiveShipmentTrackingBatch } from "../../../../../lib/server/shipment-tracking.ts"

export const runtime = "nodejs"

export const GET = createMelhorEnvioTrackingHandler({
  getCronSecret,
  refreshBatch: refreshActiveShipmentTrackingBatch,
})
