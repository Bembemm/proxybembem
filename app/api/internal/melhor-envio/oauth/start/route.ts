import { createHash, randomBytes } from "node:crypto"
import { NextRequest } from "next/server.js"
import {
  getMelhorEnvioOAuthEnv,
  isAllowedCheckoutOrigin,
  resolvePublicSiteUrl,
} from "../../../../../../lib/server/env.ts"
import { buildMelhorEnvioAuthorizationUrl } from "../../../../../../lib/server/melhor-envio-oauth-client.ts"
import { createOAuthState } from "../../../../../../lib/server/melhor-envio-oauth-repository.ts"
import { consumeRateLimit } from "../../../../../../lib/server/rate-limit.ts"
import { timingSafeSecretEqual } from "../../../../../../lib/server/secret-compare.ts"

export const runtime = "nodejs"

const MAX_FORM_BYTES = 4096
const STATE_TTL_MS = 10 * 60 * 1000

function response(status: number, headers?: HeadersInit) {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers,
    },
  })
}

async function readAdminSecret(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? ""
  if (!contentType.startsWith("application/x-www-form-urlencoded")) return null

  const declaredLength = request.headers.get("content-length")
  if (declaredLength) {
    const length = Number(declaredLength)
    if (Number.isFinite(length) && length > MAX_FORM_BYTES) return null
  }

  let text: string
  try {
    text = await request.text()
  } catch {
    return null
  }
  if (Buffer.byteLength(text, "utf8") > MAX_FORM_BYTES) return null

  const form = new URLSearchParams(text)
  const entries = [...form.entries()]
  if (entries.length !== 1 || entries[0]?.[0] !== "adminSecret") return null

  const secret = entries[0][1]
  if (!secret || secret.length > 1024) return null
  return secret
}

export async function POST(request: NextRequest) {
  const requestOrigin = request.nextUrl.origin

  let siteUrl: string
  try {
    siteUrl = resolvePublicSiteUrl(requestOrigin)
  } catch {
    return response(503)
  }

  if (
    !isAllowedCheckoutOrigin({
      originHeader: request.headers.get("origin"),
      configuredSiteUrl: siteUrl,
      requestOrigin,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    })
  ) {
    return response(403)
  }

  try {
    const allowed = await consumeRateLimit({
      request,
      scope: "melhor-envio-oauth-start",
    })
    if (!allowed) {
      return response(429, { "Retry-After": "900" })
    }
  } catch {
    return response(503)
  }

  const candidateSecret = await readAdminSecret(request)
  if (candidateSecret === null) return response(401)

  let env: ReturnType<typeof getMelhorEnvioOAuthEnv>
  try {
    env = getMelhorEnvioOAuthEnv()
  } catch {
    return response(503)
  }

  if (!timingSafeSecretEqual(candidateSecret, env.oauthAdminSecret)) {
    return response(401)
  }

  const state = randomBytes(32).toString("base64url")
  const stateHash = createHash("sha256").update(state).digest("hex")
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString()

  try {
    await createOAuthState({
      stateHash,
      environment: env.environment,
      expiresAt,
    })
    const location = buildMelhorEnvioAuthorizationUrl({ state })
    return response(303, {
      Location: location,
      "Referrer-Policy": "no-referrer",
    })
  } catch {
    return response(503)
  }
}
