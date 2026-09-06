import { createHmac, randomBytes, randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

import { getRateLimitEnv, getSupabaseEnv } from "./env.ts"

export const PASSWORD_RECOVERY_GRANT_TTL_SECONDS = 3600
export const PASSWORD_RECOVERY_GRANT_LEASE_SECONDS = 45
export const PASSWORD_RECOVERY_GRANT_RETRY_WINDOW_SECONDS = 300

const PASSWORD_RECOVERY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const PASSWORD_RECOVERY_GRANT_DOMAIN = "proxybembem:password-recovery-grant:v1\0"

function createServerSupabaseClient() {
  const env = getSupabaseEnv()
  return createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

export function createPasswordRecoveryAdminClient() {
  return createServerSupabaseClient()
}

export function createPasswordRecoveryToken() {
  return randomBytes(32).toString("base64url")
}

export function isValidPasswordRecoveryToken(value: unknown): value is string {
  return typeof value === "string" && PASSWORD_RECOVERY_TOKEN_PATTERN.test(value)
}

export function derivePasswordRecoveryGrantKey(token: string, secret: string) {
  if (!isValidPasswordRecoveryToken(token)) {
    throw new Error("Invalid password recovery token")
  }
  if (secret.trim().length < 32) {
    throw new Error("Password recovery grant secret must contain at least 32 characters")
  }

  return createHmac("sha256", secret)
    .update(PASSWORD_RECOVERY_GRANT_DOMAIN)
    .update(token)
    .digest("hex")
}

function recoveryGrantContext(token: string) {
  const env = getRateLimitEnv()
  return {
    supabase: createClient(env.supabaseUrl, env.supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }),
    grantKey: derivePasswordRecoveryGrantKey(token, env.rateLimitSecret),
  }
}

export async function issuePasswordRecoveryGrant(input: {
  token: string
  userId: string
}) {
  const { supabase, grantKey } = recoveryGrantContext(input.token)
  const { error } = await supabase.rpc("issue_password_recovery_grant", {
    p_grant_key: grantKey,
    p_user_id: input.userId,
    p_ttl_seconds: PASSWORD_RECOVERY_GRANT_TTL_SECONDS,
  })

  if (error) {
    throw new Error("Password recovery grant issuance failed")
  }
}

export type PasswordRecoveryGrantClaim =
  | { status: "claimed"; userId: string; leaseId: string }
  | { status: "busy" | "invalid" }

export async function claimPasswordRecoveryGrant(
  token: string,
): Promise<PasswordRecoveryGrantClaim> {
  const { supabase, grantKey } = recoveryGrantContext(token)
  const leaseId = randomUUID()
  const { data, error } = await supabase.rpc("claim_password_recovery_grant", {
    p_grant_key: grantKey,
    p_lease_id: leaseId,
    p_lease_seconds: PASSWORD_RECOVERY_GRANT_LEASE_SECONDS,
    p_retry_window_seconds: PASSWORD_RECOVERY_GRANT_RETRY_WINDOW_SECONDS,
  })

  if (error) {
    throw new Error("Password recovery grant claim failed")
  }

  const row = Array.isArray(data) ? data[0] : null
  if (!row || typeof row !== "object") {
    throw new Error("Password recovery grant claim returned invalid data")
  }

  const status = (row as { status?: unknown }).status
  const userId = (row as { user_id?: unknown }).user_id

  if (status === "busy" || status === "invalid") {
    return { status }
  }
  if (status !== "claimed" || typeof userId !== "string" || userId.length === 0) {
    throw new Error("Password recovery grant claim returned invalid data")
  }

  return { status: "claimed", userId, leaseId }
}

export async function finishPasswordRecoveryGrant(input: {
  token: string
  leaseId: string
  success: boolean
}) {
  const { supabase, grantKey } = recoveryGrantContext(input.token)
  const { data, error } = await supabase.rpc("finish_password_recovery_grant", {
    p_grant_key: grantKey,
    p_lease_id: input.leaseId,
    p_success: input.success,
  })

  if (error || typeof data !== "boolean") {
    throw new Error("Password recovery grant finalization failed")
  }
  return data
}
