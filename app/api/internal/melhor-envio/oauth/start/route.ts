import { authorizeAdminAccess } from "../../../../../../lib/server/admin-auth.ts"
import { createMelhorEnvioOAuthStartHandler } from "../../../../../../lib/server/melhor-envio-oauth-start.ts"
import { createOAuthState } from "../../../../../../lib/server/melhor-envio-oauth-repository.ts"
import { consumeRateLimit } from "../../../../../../lib/server/rate-limit.ts"

export const runtime = "nodejs"

export const POST = createMelhorEnvioOAuthStartHandler({
  authorizeAdmin: () => authorizeAdminAccess({ touch: true }),
  consumeRateLimit: (request) =>
    consumeRateLimit({
      request,
      scope: "melhor-envio-oauth-start",
    }),
  createOAuthState,
})
