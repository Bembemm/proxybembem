export interface AdminPrincipal {
  userId: string
  authSessionId: string
  aal: "aal1" | "aal2"
}

export type AdminIdentityResult =
  | { ok: true; principal: AdminPrincipal }
  | {
      ok: false
      reason: "unauthenticated" | "not_admin" | "mfa_required" | "invalid_session"
    }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEFAULT_FRESHNESS_SECONDS = 600

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function validateAdminIdentity(input: {
  claims: unknown
  adminUserId: string
  requireAal2: boolean
}): AdminIdentityResult {
  const row = record(input.claims)
  if (!row || row.is_anonymous === true || typeof row.sub !== "string") {
    return { ok: false, reason: "unauthenticated" }
  }

  if (row.sub !== input.adminUserId) {
    return { ok: false, reason: "not_admin" }
  }

  if (typeof row.session_id !== "string" || !UUID_RE.test(row.session_id)) {
    return { ok: false, reason: "invalid_session" }
  }

  if (row.aal !== "aal1" && row.aal !== "aal2") {
    return { ok: false, reason: "invalid_session" }
  }

  if (input.requireAal2 && row.aal !== "aal2") {
    return { ok: false, reason: "mfa_required" }
  }

  return {
    ok: true,
    principal: {
      userId: row.sub,
      authSessionId: row.session_id,
      aal: row.aal,
    },
  }
}

function isFreshAmrEntry(input: {
  value: unknown
  method: "password" | "totp"
  nowSeconds: number
  maxAgeSeconds: number
}) {
  const entry = record(input.value)
  if (!entry || entry.method !== input.method) return false

  const timestamp = entry.timestamp
  if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp)) return false

  return (
    timestamp <= input.nowSeconds &&
    timestamp >= input.nowSeconds - input.maxAgeSeconds
  )
}

export function hasFreshPasswordAndTotp(input: {
  claims: unknown
  nowSeconds: number
  maxAgeSeconds?: number
}): boolean {
  const row = record(input.claims)
  if (!row || !Array.isArray(row.amr)) return false
  if (!Number.isSafeInteger(input.nowSeconds)) return false

  const amr = row.amr
  const maxAgeSeconds = input.maxAgeSeconds ?? DEFAULT_FRESHNESS_SECONDS
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 0) return false

  const fresh = (method: "password" | "totp") =>
    amr.some((value) =>
      isFreshAmrEntry({
        value,
        method,
        nowSeconds: input.nowSeconds,
        maxAgeSeconds,
      }),
    )

  return fresh("password") && fresh("totp")
}
