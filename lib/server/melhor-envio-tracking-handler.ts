import { timingSafeSecretEqual } from "./secret-compare.ts"

export interface TrackingHandlerDependencies {
  getCronSecret(): string
  refreshBatch(input: { limit: number }): Promise<{
    checked: number
    changed: number
    attention: number
  }>
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function bearerSecret(request: Request): string | null {
  const authorization = request.headers.get("authorization")
  if (!authorization) return null
  const match = /^Bearer ([^\s]+)$/.exec(authorization)
  if (!match) return null
  const candidate = match[1]
  if (!candidate || candidate.length > 1024) return null
  return candidate
}

function kingHostCronSecret(request: Request): string | null {
  const candidate = request.headers.get("x-cron-auth")
  if (!candidate || candidate.length > 1024 || /\s/.test(candidate)) return null
  return candidate
}

function requestSecret(request: Request) {
  return kingHostCronSecret(request) ?? bearerSecret(request)
}

export function createMelhorEnvioTrackingHandler(deps: TrackingHandlerDependencies) {
  return async function handle(request: Request): Promise<Response> {
    let expectedSecret: string
    try {
      expectedSecret = deps.getCronSecret()
    } catch {
      return jsonResponse({ ok: false }, 401)
    }

    const candidateSecret = requestSecret(request)
    if (candidateSecret === null || !timingSafeSecretEqual(candidateSecret, expectedSecret)) {
      return jsonResponse({ ok: false }, 401)
    }

    try {
      const result = await deps.refreshBatch({ limit: 20 })
      return jsonResponse({ ok: true, ...result }, 200)
    } catch {
      return jsonResponse({ ok: false }, 503)
    }
  }
}
