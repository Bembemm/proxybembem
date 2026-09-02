const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NIL_UUID = "00000000-0000-0000-0000-000000000000"
const PROFILE_SELECT = "id,name,whatsapp,created_at,updated_at"

export interface CustomerProfile {
  id: string
  name: string
  whatsapp: string
  createdAt: string
  updatedAt: string
}

interface CustomerProfileWrite {
  name: string
  whatsapp: string
}

interface CustomerProfileInsert extends CustomerProfileWrite {
  id: string
}

export interface CustomerProfileDependencies {
  getCurrentUserId(): Promise<string | null>
  readOwnProfile(): Promise<unknown>
  upsertOwnProfile(profile: CustomerProfileInsert): Promise<unknown>
  updateOwnProfile(userId: string, profile: CustomerProfileWrite): Promise<unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function normalizeWhatsapp(value: string) {
  return value.replace(/\D/g, "")
}

function normalizeProfileInput(input: { name: string; whatsapp: string }): CustomerProfileWrite {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid customer profile input")
  }

  if (typeof input.name !== "string" || typeof input.whatsapp !== "string") {
    throw new Error("Invalid customer profile input")
  }

  const name = normalizeName(input.name)
  const whatsapp = normalizeWhatsapp(input.whatsapp)

  if (name.length < 3 || name.length > 100 || !/^\d{10,11}$/.test(whatsapp)) {
    throw new Error("Invalid customer profile input")
  }

  return { name, whatsapp }
}

function normalizeTrustedUserId(value: string | null): string {
  if (
    typeof value !== "string" ||
    !UUID_PATTERN.test(value) ||
    value.toLowerCase() === NIL_UUID
  ) {
    throw new Error("Customer profile access requires authentication")
  }
  return value.toLowerCase()
}

function parseProfile(value: unknown): CustomerProfile {
  if (!isRecord(value)) {
    throw new Error("Customer profile storage returned an invalid response")
  }

  if (
    typeof value.id !== "string" ||
    !UUID_PATTERN.test(value.id) ||
    value.id.toLowerCase() === NIL_UUID ||
    typeof value.name !== "string" ||
    value.name.length < 3 ||
    value.name.length > 100 ||
    typeof value.whatsapp !== "string" ||
    !/^\d{10,11}$/.test(value.whatsapp) ||
    typeof value.created_at !== "string" ||
    !Number.isFinite(Date.parse(value.created_at)) ||
    typeof value.updated_at !== "string" ||
    !Number.isFinite(Date.parse(value.updated_at))
  ) {
    throw new Error("Customer profile storage returned an invalid response")
  }

  return {
    id: value.id.toLowerCase(),
    name: value.name,
    whatsapp: value.whatsapp,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  }
}

function assertOwnProfile(profile: CustomerProfile, userId: string) {
  if (profile.id !== userId) {
    throw new Error("Customer profile storage returned an invalid response")
  }
  return profile
}

async function requireTrustedUserId(deps: CustomerProfileDependencies) {
  return normalizeTrustedUserId(await deps.getCurrentUserId())
}

export async function getOwnCustomerProfileWithDependencies(
  deps: CustomerProfileDependencies,
): Promise<CustomerProfile | null> {
  const userId = await requireTrustedUserId(deps)
  const row = await deps.readOwnProfile()
  if (row === null) return null
  return assertOwnProfile(parseProfile(row), userId)
}

export async function ensureOwnCustomerProfileWithDependencies(
  input: { name: string; whatsapp: string },
  deps: CustomerProfileDependencies,
): Promise<CustomerProfile> {
  const profile = normalizeProfileInput(input)
  const userId = await requireTrustedUserId(deps)
  const row = await deps.upsertOwnProfile({ id: userId, ...profile })
  return assertOwnProfile(parseProfile(row), userId)
}

export async function updateOwnCustomerProfileWithDependencies(
  input: { name: string; whatsapp: string },
  deps: CustomerProfileDependencies,
): Promise<CustomerProfile> {
  const profile = normalizeProfileInput(input)
  const userId = await requireTrustedUserId(deps)
  const row = await deps.updateOwnProfile(userId, profile)
  return assertOwnProfile(parseProfile(row), userId)
}

async function createProductionDependencies(): Promise<CustomerProfileDependencies> {
  const { createSupabaseServerClient } = await import("../supabase/server.ts")
  const supabase = await createSupabaseServerClient()

  return {
    async getCurrentUserId() {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data.user) return null
      return data.user.id
    },
    async readOwnProfile() {
      const { data, error } = await supabase
        .from("customer_profiles")
        .select(PROFILE_SELECT)
        .maybeSingle()
      if (error) throw new Error("Customer profile storage request failed")
      return data
    },
    async upsertOwnProfile(profile) {
      const { data, error } = await supabase
        .from("customer_profiles")
        .upsert(profile, { onConflict: "id" })
        .select(PROFILE_SELECT)
        .single()
      if (error) throw new Error("Customer profile storage request failed")
      return data
    },
    async updateOwnProfile(userId, profile) {
      const { data, error } = await supabase
        .from("customer_profiles")
        .update(profile)
        .eq("id", userId)
        .select(PROFILE_SELECT)
        .single()
      if (error) throw new Error("Customer profile storage request failed")
      return data
    },
  }
}

export async function getOwnCustomerProfile(): Promise<CustomerProfile | null> {
  return getOwnCustomerProfileWithDependencies(await createProductionDependencies())
}

export async function ensureOwnCustomerProfile(input: {
  name: string
  whatsapp: string
}): Promise<CustomerProfile> {
  return ensureOwnCustomerProfileWithDependencies(
    input,
    await createProductionDependencies(),
  )
}

export async function updateOwnCustomerProfile(input: {
  name: string
  whatsapp: string
}): Promise<CustomerProfile> {
  return updateOwnCustomerProfileWithDependencies(
    input,
    await createProductionDependencies(),
  )
}
