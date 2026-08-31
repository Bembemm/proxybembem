import { getSupabaseEnv } from "./env.ts"

export type AdminSessionStatus = "active" | "missing" | "revoked" | "expired"

const REQUEST_TIMEOUT_MS = 10_000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function requestError() {
  return new Error("Admin session repository request failed")
}

function responseError() {
  return new Error("Invalid admin session repository response")
}

async function postRpc(name: string, body: Record<string, unknown>): Promise<unknown> {
  const env = getSupabaseEnv()
  const headers = new Headers({
    apikey: env.supabaseSecretKey,
    Accept: "application/json",
    "Content-Type": "application/json",
  })

  let response: Response
  try {
    response = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw requestError()
  }

  if (!response.ok) {
    throw requestError()
  }

  try {
    return await response.json()
  } catch {
    throw responseError()
  }
}

function parseUuidOrNull(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== "string" || !UUID_RE.test(value)) throw responseError()
  return value.toLowerCase()
}

function parseStatus(value: unknown): AdminSessionStatus {
  if (
    value !== "active" &&
    value !== "missing" &&
    value !== "revoked" &&
    value !== "expired"
  ) {
    throw responseError()
  }
  return value
}

function parseBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw responseError()
  return value
}

export async function activateAdminSession(input: {
  authSessionId: string
  userId: string
}): Promise<string | null> {
  return parseUuidOrNull(
    await postRpc("activate_admin_session", {
      p_auth_session_id: input.authSessionId,
      p_user_id: input.userId,
    }),
  )
}

export async function authorizeAdminSession(input: {
  authSessionId: string
  userId: string
  touch: boolean
}): Promise<AdminSessionStatus> {
  return parseStatus(
    await postRpc("authorize_admin_session", {
      p_auth_session_id: input.authSessionId,
      p_user_id: input.userId,
      p_touch: input.touch,
    }),
  )
}

export async function revokeAdminSession(input: {
  authSessionId: string
  userId: string
}): Promise<boolean> {
  return parseBoolean(
    await postRpc("revoke_admin_session", {
      p_auth_session_id: input.authSessionId,
      p_user_id: input.userId,
    }),
  )
}
