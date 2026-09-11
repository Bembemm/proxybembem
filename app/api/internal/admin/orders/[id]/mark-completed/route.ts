import { authorizeAdminAccess } from "../../../../../../../lib/server/admin-auth.ts"
import { createAdminOrderActionHandler } from "../../../../../../../lib/server/admin-order-actions.ts"
import { transitionAdminOrderFulfillment } from "../../../../../../../lib/server/admin-order-operations.ts"

export const runtime = "nodejs"

export const POST = createAdminOrderActionHandler({
  targetStatus: "completed",
  authorizeAdmin: () => authorizeAdminAccess({ touch: true }),
  transitionOrder: transitionAdminOrderFulfillment,
})
