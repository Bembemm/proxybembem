import {
  DEFAULT_PUBLIC_STORE_SETTINGS,
  parseStoreSettingsRow,
  toPublicStoreSettings,
  validateStoreSettingsMutationInput,
  type PublicStoreSettings,
  type StoreSettings,
  type StoreSettingsMutationInput,
} from "../store-settings/store-settings.ts"
import { getSupabaseEnv } from "./env.ts"

const STORE_SETTINGS_SELECT = [
  "id",
  "production_lead_time_business_days",
  "contact_email",
  "contact_whatsapp_e164",
  "notice_enabled",
  "notice_text",
  "updated_at",
].join(",")

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function assertAdminUserId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Invalid admin user id")
  }
}

function assertExpectedUpdatedAt(value: string) {
  if (!value || !Number.isFinite(Date.parse(value))) {
    throw new Error("Invalid store settings revision")
  }
}

async function fetchStoreSettingsRow(): Promise<StoreSettings> {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()
  const params = new URLSearchParams({
    select: STORE_SETTINGS_SELECT,
    id: "eq.default",
    limit: "1",
  })

  let response: Response
  try {
    response = await fetch(`${supabaseUrl}/rest/v1/store_settings?${params.toString()}`, {
      headers: {
        apikey: supabaseSecretKey,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    console.error("Supabase store settings request failed", { status: "network" })
    throw new Error("Store settings storage request failed")
  }

  if (!response.ok) {
    console.error("Supabase store settings request failed", { status: response.status })
    throw new Error("Store settings storage request failed")
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error("Invalid store settings response")
  }

  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new Error("Invalid store settings response")
  }

  return parseStoreSettingsRow(payload[0])
}

export class StoreSettingsConflictError extends Error {
  constructor() {
    super("Store settings were updated by another session")
    this.name = "StoreSettingsConflictError"
  }
}

export async function getAdminStoreSettings(): Promise<StoreSettings> {
  return fetchStoreSettingsRow()
}

export async function readPublicStoreSettings(): Promise<PublicStoreSettings> {
  try {
    return toPublicStoreSettings(await fetchStoreSettingsRow())
  } catch {
    return { ...DEFAULT_PUBLIC_STORE_SETTINGS }
  }
}

export async function updateAdminStoreSettings(
  adminUserId: string,
  expectedUpdatedAt: string,
  input: StoreSettingsMutationInput,
): Promise<StoreSettings> {
  assertAdminUserId(adminUserId)
  assertExpectedUpdatedAt(expectedUpdatedAt)

  const validated = validateStoreSettingsMutationInput(input)
  if (!validated.ok) {
    throw new Error("Invalid store settings input")
  }

  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()
  let response: Response
  try {
    response = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_update_store_settings`, {
      method: "POST",
      headers: {
        apikey: supabaseSecretKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_admin_user_id: adminUserId,
        p_expected_updated_at: expectedUpdatedAt,
        p_production_lead_time_business_days:
          validated.value.productionLeadTimeBusinessDays,
        p_contact_email: validated.value.contactEmail,
        p_contact_whatsapp_e164: validated.value.contactWhatsappE164,
        p_notice_enabled: validated.value.noticeEnabled,
        p_notice_text: validated.value.noticeText,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    console.error("Supabase store settings update failed", { status: "network" })
    throw new Error("Store settings storage request failed")
  }

  if (!response.ok) {
    console.error("Supabase store settings update failed", { status: response.status })
    throw new Error("Store settings storage request failed")
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error("Invalid store settings response")
  }

  if (!isRecord(payload) || typeof payload.outcome !== "string") {
    throw new Error("Invalid store settings response")
  }

  if (payload.outcome === "conflict") {
    throw new StoreSettingsConflictError()
  }

  if (payload.outcome !== "updated" || !("settings" in payload)) {
    throw new Error("Invalid store settings response")
  }

  return parseStoreSettingsRow(payload.settings)
}
