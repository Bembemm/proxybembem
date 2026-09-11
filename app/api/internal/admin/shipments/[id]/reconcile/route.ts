import { authorizeAdminAccess } from "../../../../../../../lib/server/admin-auth.ts"
import { createAdminShipmentReconcileActionHandler } from "../../../../../../../lib/server/admin-shipment-actions.ts"
import { consumeRateLimit } from "../../../../../../../lib/server/rate-limit.ts"
import { reconcileAdminShipmentPurchase } from "../../../../../../../lib/server/shipment-service.ts"

export const runtime = "nodejs"

export const POST = createAdminShipmentReconcileActionHandler({
  authorizeAdmin: () => authorizeAdminAccess({ touch: true }),
  consumeRateLimit: (request) =>
    consumeRateLimit({ request, scope: "admin-shipping-mutation" }),
  reconcileShipment: reconcileAdminShipmentPurchase,
})
