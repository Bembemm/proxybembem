import { validateCheckout, type CheckoutData } from "./checkout.ts"

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface StoredCheckoutLoginDraft {
  version: 1
  savedAt: number
  checkout: CheckoutData
  shippingServiceId: string | null
}

export interface CheckoutLoginDraft {
  checkout: CheckoutData
  shippingServiceId: string | null
}

const STORAGE_KEY = "proxybembem-checkout-login-draft-v1"
const TTL_MS = 30 * 60 * 1000
const MAX_FUTURE_SKEW_MS = 60 * 1000
const CHECKOUT_FIELDS: Array<keyof CheckoutData> = [
  "nome",
  "email",
  "whatsapp",
  "cep",
  "rua",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
]

function removeDraft(storage: StorageLike) {
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // Browser storage may be unavailable. Failing closed simply drops restoration.
  }
}

function isCheckoutData(value: unknown): value is CheckoutData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (
    keys.length !== CHECKOUT_FIELDS.length ||
    CHECKOUT_FIELDS.some((field) => typeof record[field] !== "string")
  ) {
    return false
  }

  return Object.keys(validateCheckout(record as unknown as CheckoutData)).length === 0
}

function isShippingServiceId(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length > 0 && value.length <= 64)
}

function isStoredDraft(value: unknown, now: number): value is StoredCheckoutLoginDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const candidate = value as Partial<StoredCheckoutLoginDraft>
  return (
    candidate.version === 1 &&
    typeof candidate.savedAt === "number" &&
    Number.isFinite(candidate.savedAt) &&
    candidate.savedAt <= now + MAX_FUTURE_SKEW_MS &&
    now - candidate.savedAt <= TTL_MS &&
    isCheckoutData(candidate.checkout) &&
    isShippingServiceId(candidate.shippingServiceId)
  )
}

export function saveCheckoutLoginDraft(
  storage: StorageLike,
  checkout: CheckoutData,
  shippingServiceId: string | null,
  now = Date.now(),
): boolean {
  if (
    !Number.isFinite(now) ||
    !isCheckoutData(checkout) ||
    !isShippingServiceId(shippingServiceId)
  ) {
    return false
  }

  const draft: StoredCheckoutLoginDraft = {
    version: 1,
    savedAt: now,
    checkout: { ...checkout },
    shippingServiceId,
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function readCheckoutLoginDraft(
  storage: StorageLike,
  now = Date.now(),
): CheckoutLoginDraft | null {
  let raw: string | null

  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return null
  }

  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    removeDraft(storage)
    return null
  }

  if (!Number.isFinite(now) || !isStoredDraft(parsed, now)) {
    removeDraft(storage)
    return null
  }

  return {
    checkout: { ...parsed.checkout },
    shippingServiceId: parsed.shippingServiceId,
  }
}

export function clearCheckoutLoginDraft(storage: StorageLike): void {
  removeDraft(storage)
}
