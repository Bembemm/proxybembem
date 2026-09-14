import { randomUUID } from "node:crypto"
import { getCronSecret } from "../../../../../lib/server/env.ts"
import { processNotificationBatch } from "../../../../../lib/server/notification-worker.ts"
import { timingSafeSecretEqual } from "../../../../../lib/server/secret-compare.ts"

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function bearerCredential(request: Request) {
  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) return null
  const value = authorization.slice("Bearer ".length)
  if (!value || value.includes(" ")) return null
  return value
}

function isAuthorized(request: Request, expected: string) {
  const bearer = bearerCredential(request)
  const kingHost = request.headers.get("x-cron-auth")
  return Boolean(
    (bearer && timingSafeSecretEqual(bearer, expected)) ||
      (kingHost && timingSafeSecretEqual(kingHost, expected)),
  )
}

async function handle(request: Request) {
  let expected: string
  try {
    expected = getCronSecret()
  } catch {
    return json({ ok: false }, 401)
  }

  if (!isAuthorized(request, expected)) {
    return json({ ok: false }, 401)
  }

  try {
    const result = await processNotificationBatch({
      workerId: randomUUID(),
      limit: 25,
    })
    return json({ ok: true, ...result }, 200)
  } catch {
    console.error("Transactional notification worker failed")
    return json({ ok: false }, 503)
  }
}

export const GET = handle
export const POST = handle
