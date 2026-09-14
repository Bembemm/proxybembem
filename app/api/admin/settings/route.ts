import { authorizeAdminAccess } from "../../../../lib/server/admin-auth.ts"
import { createAdminStoreSettingsRouteHandler } from "../../../../lib/server/admin-store-settings-actions.ts"
import { invalidatePublicStoreSettings } from "../../../../lib/server/store-settings-cache.ts"
import { updateAdminStoreSettings } from "../../../../lib/server/store-settings.ts"

export const runtime = "nodejs"

export const PATCH = createAdminStoreSettingsRouteHandler({
  authorizeAdmin: () => authorizeAdminAccess({ touch: true }),
  updateAdminStoreSettings,
  invalidatePublicStoreSettings,
})
