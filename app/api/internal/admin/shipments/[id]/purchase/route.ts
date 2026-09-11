import { authorizeAdminAccess } from "../../../../../../../lib/server/admin-auth.ts"
import { createAdminShipmentPurchaseActionHandler } from "../../../../../../../lib/server/admin-shipment-actions.ts"
import { consumeRateLimit } from "../../../../../../../lib/server/rate-limit.ts"
import { purchaseAdminShipment } from "../../../../../../../lib/server/shipment-service.ts"

export const runtime = "nodejs"

export const POST = createAdminShipmentPurchaseActionHandler({
  authorizeAdmin: () => authorizeAdminAccess({ touch: true }),
  consumeRateLimit: (request) =>
    consumeRateLimit({ request, scope: "admin-shipping-spend" }),
  purchaseShipment: purchaseAdminShipment,
})
