import { normalizeCheckoutEmail } from "../checkout.ts"
import { sanitizeCustomerLoginNext } from "./customer-account-actions.ts"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NIL_UUID = "00000000-0000-0000-0000-000000000000"

export interface CustomerIdentity {
  userId: string
  email: string
  emailVerified: true
}

export interface CustomerAuthDependencies {
  getUser(): Promise<unknown>
  redirect(path: string): never | Promise<never>
}

function parseCustomerIdentity(value: unknown): CustomerIdentity | null {
  if (!value || typeof value !== "object") return null

  const candidate = value as {
    id?: unknown
    email?: unknown
    email_confirmed_at?: unknown
  }

  if (
    typeof candidate.id !== "string" ||
    !UUID_PATTERN.test(candidate.id) ||
    candidate.id.toLowerCase() === NIL_UUID ||
    typeof candidate.email !== "string" ||
    typeof candidate.email_confirmed_at !== "string" ||
    !candidate.email_confirmed_at ||
    !Number.isFinite(Date.parse(candidate.email_confirmed_at))
  ) {
    return null
  }

  const email = normalizeCheckoutEmail(candidate.email)
  if (
    email.length === 0 ||
    email.length > 254 ||
    /\s/.test(email) ||
    !/^[^@]+@[^@]+\.[^@]+$/.test(email)
  ) {
    return null
  }

  return {
    userId: candidate.id.toLowerCase(),
    email,
    emailVerified: true,
  }
}

export async function getOptionalCustomerIdentityWithDependencies(
  deps: CustomerAuthDependencies,
): Promise<CustomerIdentity | null> {
  try {
    return parseCustomerIdentity(await deps.getUser())
  } catch {
    return null
  }
}

export async function requireCustomerPageAccessWithDependencies(
  deps: CustomerAuthDependencies,
  next?: string,
): Promise<CustomerIdentity> {
  const identity = await getOptionalCustomerIdentityWithDependencies(deps)
  if (identity) return identity

  const safeNext = next ? sanitizeCustomerLoginNext(next) : null
  return await deps.redirect(
    safeNext ? `/entrar?next=${encodeURIComponent(safeNext)}` : "/entrar",
  )
}

async function createProductionDependencies(): Promise<CustomerAuthDependencies> {
  const { createSupabaseServerClient } = await import("../supabase/server.ts")
  const supabase = await createSupabaseServerClient()

  return {
    async getUser() {
      const { data, error } = await supabase.auth.getUser()
      if (error) return null
      return data.user ?? null
    },
    async redirect(path) {
      const { redirect } = await import("next/navigation")
      return redirect(path)
    },
  }
}

export async function getOptionalCustomerIdentity(): Promise<CustomerIdentity | null> {
  return getOptionalCustomerIdentityWithDependencies(await createProductionDependencies())
}

export async function requireCustomerPageAccess(
  next?: string,
): Promise<CustomerIdentity> {
  return requireCustomerPageAccessWithDependencies(
    await createProductionDependencies(),
    next,
  )
}
