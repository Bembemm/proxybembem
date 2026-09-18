const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NIL_UUID = "00000000-0000-0000-0000-000000000000"
const ADDRESS_SELECT =
  "id,customer_id,label,cep,street,number,complement,neighborhood,city,state,is_default,created_at,updated_at"

export const MAX_CUSTOMER_ADDRESSES = 5

export interface CustomerAddressInput {
  label: string
  cep: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
  isDefault: boolean
}

export interface CustomerAddress extends CustomerAddressInput {
  id: string
  customerId: string
  createdAt: string
  updatedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function exactRecord(value: unknown, keys: readonly string[]) {
  if (!isRecord(value)) throw new Error("Invalid customer address input")
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error("Invalid customer address input")
  }
  return value
}

function normalizeText(value: unknown, min: number, max: number) {
  if (typeof value !== "string") throw new Error("Invalid customer address input")
  const normalized = value.trim().replace(/\s+/g, " ")
  if (normalized.length < min || normalized.length > max) {
    throw new Error("Invalid customer address input")
  }
  return normalized
}

function normalizeOptionalText(value: unknown, max: number) {
  if (typeof value !== "string") throw new Error("Invalid customer address input")
  const normalized = value.trim().replace(/\s+/g, " ")
  if (normalized.length > max) throw new Error("Invalid customer address input")
  return normalized
}

function normalizeAddressId(value: string) {
  if (
    typeof value !== "string" ||
    !UUID_PATTERN.test(value) ||
    value.toLowerCase() === NIL_UUID
  ) {
    throw new Error("Invalid customer address id")
  }
  return value.toLowerCase()
}

export function normalizeCustomerAddressInput(value: unknown): CustomerAddressInput {
  const input = exactRecord(value, [
    "label",
    "cep",
    "street",
    "number",
    "complement",
    "neighborhood",
    "city",
    "state",
    "isDefault",
  ])

  const cep =
    typeof input.cep === "string" ? input.cep.replace(/\D/g, "") : ""
  const state =
    typeof input.state === "string" ? input.state.trim().toUpperCase() : ""

  if (
    !/^\d{8}$/.test(cep) ||
    /^(\d)\1{7}$/.test(cep) ||
    !/^[A-Z]{2}$/.test(state) ||
    typeof input.isDefault !== "boolean"
  ) {
    throw new Error("Invalid customer address input")
  }

  return {
    label: normalizeText(input.label, 1, 40),
    cep,
    street: normalizeText(input.street, 2, 120),
    number: normalizeText(input.number, 1, 20),
    complement: normalizeOptionalText(input.complement, 80),
    neighborhood: normalizeText(input.neighborhood, 2, 80),
    city: normalizeText(input.city, 2, 80),
    state,
    isDefault: input.isDefault,
  }
}

function parseCustomerAddress(value: unknown): CustomerAddress {
  if (!isRecord(value)) throw new Error("Customer address storage returned invalid data")

  if (
    typeof value.id !== "string" ||
    !UUID_PATTERN.test(value.id) ||
    typeof value.customer_id !== "string" ||
    !UUID_PATTERN.test(value.customer_id) ||
    typeof value.label !== "string" ||
    typeof value.cep !== "string" ||
    typeof value.street !== "string" ||
    typeof value.number !== "string" ||
    typeof value.complement !== "string" ||
    typeof value.neighborhood !== "string" ||
    typeof value.city !== "string" ||
    typeof value.state !== "string" ||
    typeof value.is_default !== "boolean" ||
    typeof value.created_at !== "string" ||
    !Number.isFinite(Date.parse(value.created_at)) ||
    typeof value.updated_at !== "string" ||
    !Number.isFinite(Date.parse(value.updated_at))
  ) {
    throw new Error("Customer address storage returned invalid data")
  }

  return {
    id: value.id.toLowerCase(),
    customerId: value.customer_id.toLowerCase(),
    label: value.label,
    cep: value.cep,
    street: value.street,
    number: value.number,
    complement: value.complement,
    neighborhood: value.neighborhood,
    city: value.city,
    state: value.state,
    isDefault: value.is_default,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  }
}

async function createContext() {
  const { createSupabaseServerClient } = await import("../supabase/server.ts")
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user?.email_confirmed_at) {
    throw new Error("Customer address access requires authentication")
  }
  const userId = normalizeAddressId(data.user.id)
  return { supabase, userId }
}

function rowFromInput(userId: string, input: CustomerAddressInput) {
  return {
    customer_id: userId,
    label: input.label,
    cep: input.cep,
    street: input.street,
    number: input.number,
    complement: input.complement,
    neighborhood: input.neighborhood,
    city: input.city,
    state: input.state,
    is_default: input.isDefault,
  }
}

export async function listOwnCustomerAddresses(): Promise<CustomerAddress[]> {
  const { supabase, userId } = await createContext()
  const { data, error } = await supabase
    .from("customer_addresses")
    .select(ADDRESS_SELECT)
    .eq("customer_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })

  if (error) throw new Error("Customer address storage request failed")
  return (data ?? []).map((row) => {
    const address = parseCustomerAddress(row)
    if (address.customerId !== userId) {
      throw new Error("Customer address storage returned invalid ownership")
    }
    return address
  })
}

export async function createOwnCustomerAddress(value: unknown): Promise<CustomerAddress> {
  const input = normalizeCustomerAddressInput(value)
  const { supabase, userId } = await createContext()

  const { count, error: countError } = await supabase
    .from("customer_addresses")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", userId)

  if (countError) throw new Error("Customer address storage request failed")
  if ((count ?? 0) >= MAX_CUSTOMER_ADDRESSES) {
    throw new Error("Customer address limit reached")
  }

  const { data, error } = await supabase
    .from("customer_addresses")
    .insert(rowFromInput(userId, input))
    .select(ADDRESS_SELECT)
    .single()

  if (error) throw new Error("Customer address storage request failed")
  const address = parseCustomerAddress(data)
  if (address.customerId !== userId) {
    throw new Error("Customer address storage returned invalid ownership")
  }
  return address
}

export async function updateOwnCustomerAddress(
  id: string,
  value: unknown,
): Promise<CustomerAddress> {
  const addressId = normalizeAddressId(id)
  const input = normalizeCustomerAddressInput(value)
  const { supabase, userId } = await createContext()

  const { data, error } = await supabase
    .from("customer_addresses")
    .update(rowFromInput(userId, input))
    .eq("id", addressId)
    .eq("customer_id", userId)
    .select(ADDRESS_SELECT)
    .single()

  if (error) throw new Error("Customer address storage request failed")
  const address = parseCustomerAddress(data)
  if (address.customerId !== userId) {
    throw new Error("Customer address storage returned invalid ownership")
  }
  return address
}

export async function setDefaultOwnCustomerAddress(id: string): Promise<CustomerAddress> {
  const addressId = normalizeAddressId(id)
  const { supabase, userId } = await createContext()

  const { data, error } = await supabase
    .from("customer_addresses")
    .update({ is_default: true })
    .eq("id", addressId)
    .eq("customer_id", userId)
    .select(ADDRESS_SELECT)
    .single()

  if (error) throw new Error("Customer address storage request failed")
  const address = parseCustomerAddress(data)
  if (address.customerId !== userId || !address.isDefault) {
    throw new Error("Customer address storage returned invalid ownership")
  }
  return address
}

export async function deleteOwnCustomerAddress(id: string): Promise<void> {
  const addressId = normalizeAddressId(id)
  const { supabase, userId } = await createContext()

  const { data: deleted, error } = await supabase
    .from("customer_addresses")
    .delete()
    .eq("id", addressId)
    .eq("customer_id", userId)
    .select("id,is_default")
    .single()

  if (error || !deleted) throw new Error("Customer address storage request failed")

  if (deleted.is_default === true) {
    const { data: replacement, error: replacementError } = await supabase
      .from("customer_addresses")
      .select("id")
      .eq("customer_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (replacementError) throw new Error("Customer address storage request failed")
    if (replacement?.id) {
      const { error: defaultError } = await supabase
        .from("customer_addresses")
        .update({ is_default: true })
        .eq("id", replacement.id)
        .eq("customer_id", userId)
      if (defaultError) throw new Error("Customer address storage request failed")
    }
  }
}
