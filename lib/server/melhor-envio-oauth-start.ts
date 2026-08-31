import { createHash, randomBytes } from "node:crypto"
import type { NextRequest } from "next/server.js"
import type { AdminAccessResult } from "./admin-auth.ts"
import {
  getMelhorEnvioOAuthEnv,
  isAllowedCheckoutOrigin,
  resolvePublicSiteUrl,
  type MelhorEnvioEnvironment,
} from "./env.ts"
import { buildMelhorEnvioAuthorizationUrl } from "./melhor-envio-oauth-client.ts"

const STATE_TTL_MS = 10 * 60 * 1000

export interface MelhorEnvioOAuthStartDependencies {
  authorizeAdmin(): Promise<AdminAccessResult>
  consumeRateLimit(request: NextRequest): Promise<boolean>
  createOAuthState(input: {
    stateHash: string
    environment: MelhorEnvioEnvironment
    expiresAt: string
  }): Promise<void>
}

function response(status: number, headers?: HeadersInit) {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      ...headers,
    },
  })
}

function adminFailureStatus(result: Exclude<AdminAccessResult, { ok: true }>) {
  if (result.reason === "unavailable") return 503
  if (result.reason === "not_admin") return 403
  return 401
}

export function createMelhorEnvioOAuthStartHandler(
  deps: MelhorEnvioOAuthStartDependencies,
) {
  return async function POST(request: NextRequest): Promise<Response> {
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
      const allowed = await deps.consumeRateLimit(request)
      if (!allowed) {
        return response(429, { "Retry-After": "900" })
      }
    } catch {
      return response(503)
    }

    let admin: AdminAccessResult
    try {
      admin = await deps.authorizeAdmin()
    } catch {
      return response(503)
    }

    if (!admin.ok) {
      return response(adminFailureStatus(admin))
    }

    let env: ReturnType<typeof getMelhorEnvioOAuthEnv>
    try {
      env = getMelhorEnvioOAuthEnv()
    } catch {
      return response(503)
    }

    const state = randomBytes(32).toString("base64url")
    const stateHash = createHash("sha256").update(state).digest("hex")
    const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString()

    try {
      await deps.createOAuthState({
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
}
