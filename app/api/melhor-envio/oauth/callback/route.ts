import { createHash } from "node:crypto"
import { NextRequest } from "next/server.js"
import {
  getMelhorEnvioOAuthEnv,
  resolvePublicSiteUrl,
} from "../../../../../lib/server/env.ts"
import { exchangeMelhorEnvioAuthorizationCode } from "../../../../../lib/server/melhor-envio-oauth-client.ts"
import {
  consumeOAuthState,
  upsertAuthorizedCredential,
} from "../../../../../lib/server/melhor-envio-oauth-repository.ts"
import { MELHOR_ENVIO_ACTIVE_SCOPES } from "../../../../../lib/server/melhor-envio-oauth-scopes.ts"
import { encryptMelhorEnvioToken } from "../../../../../lib/server/melhor-envio-token-crypto.ts"

export const runtime = "nodejs"

const STATE_MIN_LENGTH = 32
const STATE_MAX_LENGTH = 256
const CODE_MAX_LENGTH = 2048
const STATE_PATTERN = /^[A-Za-z0-9_-]+$/

function redirectToAdmin(request: NextRequest, status: "connected" | "failed") {
  let siteUrl: string
  try {
    siteUrl = resolvePublicSiteUrl(request.nextUrl.origin)
  } catch {
    return new Response(null, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    })
  }

  const target = new URL("/admin/integrations/melhor-envio", siteUrl)
  target.searchParams.set("status", status)
  return new Response(null, {
    status: 303,
    headers: {
      Location: target.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  })
}

function validCallbackInput(request: NextRequest): {
  code: string
  state: string
} | null {
  const params = request.nextUrl.searchParams
  if (params.has("error")) return null

  const code = params.get("code")
  const state = params.get("state")
  if (!code || code.length > CODE_MAX_LENGTH) return null
  if (
    !state ||
    state.length < STATE_MIN_LENGTH ||
    state.length > STATE_MAX_LENGTH ||
    !STATE_PATTERN.test(state)
  ) {
    return null
  }

  return { code, state }
}

export async function GET(request: NextRequest) {
  const input = validCallbackInput(request)
  if (!input) return redirectToAdmin(request, "failed")

  let env: ReturnType<typeof getMelhorEnvioOAuthEnv>
  try {
    env = getMelhorEnvioOAuthEnv()
  } catch {
    return redirectToAdmin(request, "failed")
  }

  const stateHash = createHash("sha256").update(input.state).digest("hex")

  try {
    const consumed = await consumeOAuthState({
      stateHash,
      environment: env.environment,
    })
    if (!consumed) return redirectToAdmin(request, "failed")

    const tokens = await exchangeMelhorEnvioAuthorizationCode(input.code)
    const accessTokenEnvelope = encryptMelhorEnvioToken({
      plaintext: tokens.accessToken,
      environment: env.environment,
      kind: "access",
      encryptionKeyHex: env.tokenEncryptionKey,
    })
    const refreshTokenEnvelope = encryptMelhorEnvioToken({
      plaintext: tokens.refreshToken,
      environment: env.environment,
      kind: "refresh",
      encryptionKeyHex: env.tokenEncryptionKey,
    })
    const accessTokenExpiresAt = new Date(
      Date.now() + tokens.expiresInSeconds * 1000,
    ).toISOString()

    await upsertAuthorizedCredential({
      environment: env.environment,
      accessTokenEnvelope,
      refreshTokenEnvelope,
      accessTokenExpiresAt,
      authorizedScopes: MELHOR_ENVIO_ACTIVE_SCOPES,
    })

    return redirectToAdmin(request, "connected")
  } catch {
    return redirectToAdmin(request, "failed")
  }
}
