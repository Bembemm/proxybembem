import { redirect } from "next/navigation"
import {
  activateAdminSession,
  authorizeAdminSession,
  revokeAdminSession,
  type AdminSessionStatus,
} from "./admin-session-repository.ts"
import {
  hasFreshPasswordAndTotp,
  validateAdminIdentity,
  type AdminPrincipal,
} from "./admin-auth-core.ts"
import { getAdminAuthEnv } from "./env.ts"
import { createSupabaseServerClient } from "../supabase/server.ts"

export type AdminAccessFailure =
  | "unauthenticated"
  | "not_admin"
  | "mfa_required"
  | "invalid_session"
  | "session_missing"
  | "session_revoked"
  | "session_expired"
  | "fresh_login_required"
  | "session_reused"
  | "unavailable"

export type AdminAccessResult =
  | { ok: true; principal: AdminPrincipal }
  | { ok: false; reason: AdminAccessFailure }

export interface AdminAuthDependencies {
  adminUserId: string
  nowSeconds(): number
  getClaims(): Promise<unknown>
  signOut(): Promise<void>
  authorizeSession(input: {
    authSessionId: string
    userId: string
    touch: boolean
  }): Promise<AdminSessionStatus>
  activateSession(input: {
    authSessionId: string
    userId: string
  }): Promise<string | null>
  revokeSession(input: {
    authSessionId: string
    userId: string
  }): Promise<boolean>
}

async function safeSignOut(deps: AdminAuthDependencies) {
  try {
    await deps.signOut()
  } catch {
    // Authorization is already denied; cookie cleanup is best effort here.
  }
}

function shouldClearIdentity(reason: AdminAccessFailure) {
  return reason === "not_admin" || reason === "invalid_session"
}

async function loadClaims(deps: AdminAuthDependencies): Promise<
  | { ok: true; claims: unknown }
  | { ok: false; result: AdminAccessResult }
> {
  try {
    return { ok: true, claims: await deps.getClaims() }
  } catch {
    return { ok: false, result: { ok: false, reason: "unavailable" } }
  }
}

export async function authorizeAdminAccessWithDependencies(
  deps: AdminAuthDependencies,
  input: { touch?: boolean } = {},
): Promise<AdminAccessResult> {
  const loaded = await loadClaims(deps)
  if (!loaded.ok) return loaded.result

  const identity = validateAdminIdentity({
    claims: loaded.claims,
    adminUserId: deps.adminUserId,
    requireAal2: true,
  })

  if (!identity.ok) {
    if (shouldClearIdentity(identity.reason)) await safeSignOut(deps)
    return { ok: false, reason: identity.reason }
  }

  let status: AdminSessionStatus
  try {
    status = await deps.authorizeSession({
      authSessionId: identity.principal.authSessionId,
      userId: identity.principal.userId,
      touch: input.touch ?? true,
    })
  } catch {
    return { ok: false, reason: "unavailable" }
  }

  if (status === "active") {
    return { ok: true, principal: identity.principal }
  }

  await safeSignOut(deps)
  return { ok: false, reason: `session_${status}` }
}

export async function activateCurrentAdminSessionWithDependencies(
  deps: AdminAuthDependencies,
): Promise<AdminAccessResult> {
  const loaded = await loadClaims(deps)
  if (!loaded.ok) return loaded.result

  const identity = validateAdminIdentity({
    claims: loaded.claims,
    adminUserId: deps.adminUserId,
    requireAal2: true,
  })

  if (!identity.ok) {
    if (shouldClearIdentity(identity.reason)) await safeSignOut(deps)
    return { ok: false, reason: identity.reason }
  }

  if (
    !hasFreshPasswordAndTotp({
      claims: loaded.claims,
      nowSeconds: deps.nowSeconds(),
      maxAgeSeconds: 600,
    })
  ) {
    await safeSignOut(deps)
    return { ok: false, reason: "fresh_login_required" }
  }

  let adminSessionId: string | null
  try {
    adminSessionId = await deps.activateSession({
      authSessionId: identity.principal.authSessionId,
      userId: identity.principal.userId,
    })
  } catch {
    return { ok: false, reason: "unavailable" }
  }

  if (adminSessionId === null) {
    await safeSignOut(deps)
    return { ok: false, reason: "session_reused" }
  }

  return { ok: true, principal: identity.principal }
}

export async function revokeCurrentAdminSessionWithDependencies(
  deps: AdminAuthDependencies,
): Promise<void> {
  try {
    let claims: unknown
    try {
      claims = await deps.getClaims()
    } catch {
      return
    }

    const identity = validateAdminIdentity({
      claims,
      adminUserId: deps.adminUserId,
      requireAal2: false,
    })

    if (!identity.ok) return

    try {
      await deps.revokeSession({
        authSessionId: identity.principal.authSessionId,
        userId: identity.principal.userId,
      })
    } catch {
      // Local auth must still be cleared even when the app-session store is down.
    }
  } finally {
    await safeSignOut(deps)
  }
}

async function createProductionDependencies(): Promise<AdminAuthDependencies> {
  const supabase = await createSupabaseServerClient()
  const { adminUserId } = getAdminAuthEnv()

  return {
    adminUserId,
    nowSeconds: () => Math.floor(Date.now() / 1000),
    async getClaims() {
      const { data, error } = await supabase.auth.getClaims()
      if (error) throw new Error("Admin claims unavailable")
      return data?.claims ?? null
    },
    async signOut() {
      const { error } = await supabase.auth.signOut({ scope: "local" })
      if (error) throw new Error("Admin sign out failed")
    },
    authorizeSession: authorizeAdminSession,
    activateSession: activateAdminSession,
    revokeSession: revokeAdminSession,
  }
}

export async function authorizeAdminAccess(
  input: { touch?: boolean } = {},
): Promise<AdminAccessResult> {
  try {
    return await authorizeAdminAccessWithDependencies(
      await createProductionDependencies(),
      input,
    )
  } catch {
    return { ok: false, reason: "unavailable" }
  }
}

export async function activateCurrentAdminSession(): Promise<AdminAccessResult> {
  try {
    return await activateCurrentAdminSessionWithDependencies(
      await createProductionDependencies(),
    )
  } catch {
    return { ok: false, reason: "unavailable" }
  }
}

export async function revokeCurrentAdminSession(): Promise<void> {
  let deps: AdminAuthDependencies
  try {
    deps = await createProductionDependencies()
  } catch {
    return
  }
  await revokeCurrentAdminSessionWithDependencies(deps)
}

export async function requireAdminPageAccess(
  input: { touch?: boolean } = {},
): Promise<AdminPrincipal> {
  const result = await authorizeAdminAccess(input)
  if (result.ok) return result.principal

  if (result.reason === "mfa_required") {
    redirect("/admin/mfa")
  }

  if (result.reason === "unavailable") {
    throw new Error("Admin access unavailable")
  }

  redirect("/admin/login")
}
