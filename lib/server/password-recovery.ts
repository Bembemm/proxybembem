export const RECOVERY_TOKEN_COOKIE = "proxybembem-recovery-token"
export const RECOVERY_TOKEN_MAX_AGE_SECONDS = 3600

// Supabase Auth currently derives recovery token hashes with SHA-224,
// which produces 56 hexadecimal characters. Keep the upper bound defensive
// without rejecting the provider's valid token format.
const RECOVERY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{56,512}$/
const RECOVERY_AMR_FUTURE_SKEW_SECONDS = 300

export function isValidRecoveryTokenHash(value: unknown): value is string {
  return typeof value === "string" && RECOVERY_TOKEN_PATTERN.test(value)
}

export function recoveryTokenCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: RECOVERY_TOKEN_MAX_AGE_SECONDS,
  }
}

export function clearedRecoveryTokenCookieOptions() {
  return {
    ...recoveryTokenCookieOptions(),
    maxAge: 0,
  }
}

export function hasRecentRecoveryAmr(
  claims: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!claims || typeof claims !== "object" || !Number.isFinite(nowSeconds)) return false

  const amr = (claims as { amr?: unknown }).amr
  if (!Array.isArray(amr)) return false

  return amr.some((entry) => {
    if (!entry || typeof entry !== "object") return false
    const method = (entry as { method?: unknown }).method
    const timestamp = (entry as { timestamp?: unknown }).timestamp
    if (method !== "recovery" || typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
      return false
    }

    const age = nowSeconds - timestamp
    return (
      age >= -RECOVERY_AMR_FUTURE_SKEW_SECONDS &&
      age <= RECOVERY_TOKEN_MAX_AGE_SECONDS
    )
  })
}
