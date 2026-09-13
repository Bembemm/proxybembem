import { authorizeAdminAccess } from "../../../../../../../../../lib/server/admin-auth.ts"
import { createAdminOrderNotificationResendHandler } from "../../../../../../../../../lib/server/admin-order-notification-actions.ts"
import { resendAdminOrderNotification } from "../../../../../../../../../lib/server/admin-order-notifications.ts"

export const runtime = "nodejs"

export const POST = createAdminOrderNotificationResendHandler({
  authorizeAdmin: () => authorizeAdminAccess({ touch: true }),
  resend: resendAdminOrderNotification,
})
