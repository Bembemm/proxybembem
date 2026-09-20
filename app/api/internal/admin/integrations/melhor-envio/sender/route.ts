import { authorizeAdminAccess } from "../../../../../../../lib/server/admin-auth.ts"
import { createAdminShippingSenderActionHandler } from "../../../../../../../lib/server/admin-shipping-sender-action.ts"
import { getMelhorEnvioOAuthEnv } from "../../../../../../../lib/server/env.ts"
import { consumeRateLimit } from "../../../../../../../lib/server/rate-limit.ts"
import {
  getShippingSenderProfile,
  upsertShippingSenderProfile,
} from "../../../../../../../lib/server/shipping-sender.ts"

export const POST = createAdminShippingSenderActionHandler({
  authorizeAdmin: () => authorizeAdminAccess({ touch: true }),
  consumeRateLimit: (request) =>
    consumeRateLimit({ request, scope: "admin-shipping-config" }),
  getConfig: getMelhorEnvioOAuthEnv,
  getSenderProfile: getShippingSenderProfile,
  upsertSenderProfile: upsertShippingSenderProfile,
})
