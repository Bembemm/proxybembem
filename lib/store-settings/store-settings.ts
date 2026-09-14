export interface StoreSettingsMutationInput {
  productionLeadTimeBusinessDays: number
  contactEmail: string | null
  contactWhatsappE164: string | null
  noticeEnabled: boolean
  noticeText: string | null
}

export interface StoreSettings extends StoreSettingsMutationInput {
  id: "default"
  updatedAt: string
}

export type PublicStoreSettings = StoreSettingsMutationInput

export type StoreSettingsFieldErrors = Record<string, string>

export type StoreSettingsMutationValidationResult =
  | { ok: true; value: StoreSettingsMutationInput }
  | { ok: false; fieldErrors: StoreSettingsFieldErrors }

export const DEFAULT_PUBLIC_STORE_SETTINGS: PublicStoreSettings = {
  productionLeadTimeBusinessDays: 5,
  contactEmail: null,
  contactWhatsappE164: null,
  noticeEnabled: false,
  noticeText: null,
}

const MUTATION_KEYS = [
  "productionLeadTimeBusinessDays",
  "contactEmail",
  "contactWhatsappE164",
  "noticeEnabled",
  "noticeText",
] as const

const ROW_KEYS = [
  "id",
  "production_lead_time_business_days",
  "contact_email",
  "contact_whatsapp_e164",
  "notice_enabled",
  "notice_text",
  "updated_at",
] as const

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:z|[+-]\d{2}:\d{2})$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(value)
  return keys.length === expected.length && expected.every((key) => key in value)
}

function normalizeOptionalEmail(
  value: unknown,
  errors: StoreSettingsFieldErrors,
): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== "string") {
    errors.contactEmail = "Informe um e-mail válido."
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (normalized.length === 0) return null
  if (
    normalized.length > 254 ||
    CONTROL_CHARACTERS.test(normalized) ||
    !EMAIL_PATTERN.test(normalized)
  ) {
    errors.contactEmail = "Informe um e-mail válido."
  }
  return normalized
}

function normalizeOptionalWhatsapp(
  value: unknown,
  errors: StoreSettingsFieldErrors,
): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== "string") {
    errors.contactWhatsappE164 = "Informe um WhatsApp internacional válido."
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed !== value || !E164_PATTERN.test(value)) {
    errors.contactWhatsappE164 = "Informe um WhatsApp internacional válido."
  }
  return value
}

function normalizeOptionalNotice(
  value: unknown,
  errors: StoreSettingsFieldErrors,
): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== "string") {
    errors.noticeText = "Informe um aviso válido."
    return null
  }

  const normalized = value.trim()
  if (normalized.length === 0) return null
  if (normalized.length > 400 || CONTROL_CHARACTERS.test(normalized)) {
    errors.noticeText = "Informe um aviso válido."
  }
  return normalized
}

export function validateStoreSettingsMutationInput(
  value: unknown,
): StoreSettingsMutationValidationResult {
  if (!isRecord(value)) {
    return { ok: false, fieldErrors: { _form: "Configurações inválidas." } }
  }

  if (!hasExactKeys(value, MUTATION_KEYS)) {
    return { ok: false, fieldErrors: { _form: "Configurações inválidas." } }
  }

  const errors: StoreSettingsFieldErrors = {}

  const leadTime = value.productionLeadTimeBusinessDays
  if (
    typeof leadTime !== "number" ||
    !Number.isSafeInteger(leadTime) ||
    leadTime < 1 ||
    leadTime > 15
  ) {
    errors.productionLeadTimeBusinessDays = "Informe um prazo entre 1 e 15 dias úteis."
  }

  const contactEmail = normalizeOptionalEmail(value.contactEmail, errors)
  const contactWhatsappE164 = normalizeOptionalWhatsapp(
    value.contactWhatsappE164,
    errors,
  )
  const noticeText = normalizeOptionalNotice(value.noticeText, errors)

  const noticeEnabled = value.noticeEnabled
  if (typeof noticeEnabled !== "boolean") {
    errors.noticeEnabled = "Campo inválido."
  } else if (noticeEnabled && !noticeText) {
    errors.noticeText = "Informe o texto do aviso antes de ativá-lo."
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, fieldErrors: errors }
  }

  return {
    ok: true,
    value: {
      productionLeadTimeBusinessDays: leadTime as number,
      contactEmail,
      contactWhatsappE164,
      noticeEnabled: noticeEnabled as boolean,
      noticeText,
    },
  }
}

function isValidIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  )
}

export function parseStoreSettingsRow(value: unknown): StoreSettings {
  if (!isRecord(value) || !hasExactKeys(value, ROW_KEYS) || value.id !== "default") {
    throw new Error("Invalid store settings row")
  }

  if (!isValidIsoTimestamp(value.updated_at)) {
    throw new Error("Invalid store settings row")
  }

  const validation = validateStoreSettingsMutationInput({
    productionLeadTimeBusinessDays: value.production_lead_time_business_days,
    contactEmail: value.contact_email,
    contactWhatsappE164: value.contact_whatsapp_e164,
    noticeEnabled: value.notice_enabled,
    noticeText: value.notice_text,
  })

  if (!validation.ok) {
    throw new Error("Invalid store settings row")
  }

  return {
    id: "default",
    ...validation.value,
    updatedAt: value.updated_at,
  }
}

export function toPublicStoreSettings(value: StoreSettings): PublicStoreSettings {
  return {
    productionLeadTimeBusinessDays: value.productionLeadTimeBusinessDays,
    contactEmail: value.contactEmail,
    contactWhatsappE164: value.contactWhatsappE164,
    noticeEnabled: value.noticeEnabled,
    noticeText: value.noticeText,
  }
}
