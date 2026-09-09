import { authorizeAdminAccess } from "../../../../../../../../lib/server/admin-auth.ts"
import { createAdminShipmentPrepareActionHandler } from "../../../../../../../../lib/server/admin-shipment-actions.ts"
import { consumeRateLimit } from "../../../../../../../../lib/server/rate-limit.ts"
import { prepareAdminShipment } from "../../../../../../../../lib/server/shipment-service.ts"

export const runtime = "nodejs"

export const POST = createAdminShipmentPrepareActionHandler({
  authorizeAdmin: () => authorizeAdminAccess({ touch: true }),
  consumeRateLimit: (request) =>
    consumeRateLimit({ request, scope: "admin-shipping-mutation" }),
  prepareShipment: prepareAdminShipment,
})
