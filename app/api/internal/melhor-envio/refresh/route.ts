import { getCronSecret } from "../../../../../lib/server/env.ts"
import { createMelhorEnvioRefreshHandler } from "../../../../../lib/server/melhor-envio-refresh-handler.ts"
import { getMelhorEnvioAccessToken } from "../../../../../lib/server/melhor-envio-token-manager.ts"

export const runtime = "nodejs"

export const GET = createMelhorEnvioRefreshHandler({
  getCronSecret,
  getAccessToken: () => getMelhorEnvioAccessToken(),
})
