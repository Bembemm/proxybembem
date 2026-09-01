import { getSupabaseEnv } from "./env.ts"

const ORDER_NUMBER_PATTERN = /^PB-[A-F0-9]{12}$/
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/i
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type CheckoutPreferenceClaim =
  | { outcome: "claimed" | "reclaimed" | "busy" | "conflict" | "not_found" }
  | { outcome: "ready"; checkoutUrl: string }

async function rpc(name: string, body: Record<string, unknown>) {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: supabaseSecretKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    console.error("Supabase checkout preference lease request failed", {
      rpc: name,
      status: response.status,
    })
    throw new Error("Checkout preference coordination failed")
  }

  return response.json() as Promise<unknown>
}

function validateIdentity(orderNumber: string, checkoutFingerprint: string, leaseId: string) {
  if (
    !ORDER_NUMBER_PATTERN.test(orderNumber) ||
    !FINGERPRINT_PATTERN.test(checkoutFingerprint) ||
    !UUID_PATTERN.test(leaseId)
  ) {
    throw new Error("Invalid checkout preference lease identity")
  }
}

export async function claimCheckoutPreference(input: {
  orderNumber: string
  checkoutFingerprint: string
  leaseId: string
}): Promise<CheckoutPreferenceClaim> {
  validateIdentity(input.orderNumber, input.checkoutFingerprint, input.leaseId)

  const payload = await rpc("claim_checkout_preference", {
    p_order_number: input.orderNumber,
    p_checkout_fingerprint: input.checkoutFingerprint,
    p_lease_id: input.leaseId,
  })

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Checkout preference claim returned an invalid response")
  }

  const candidate = payload as { outcome?: unknown; checkout_url?: unknown }
  if (
    candidate.outcome === "claimed" ||
    candidate.outcome === "reclaimed" ||
    candidate.outcome === "busy" ||
    candidate.outcome === "conflict" ||
    candidate.outcome === "not_found"
  ) {
    return { outcome: candidate.outcome }
  }

  if (
    candidate.outcome === "ready" &&
    typeof candidate.checkout_url === "string" &&
    candidate.checkout_url.length > 0 &&
    candidate.checkout_url.length <= 2048
  ) {
    return { outcome: "ready", checkoutUrl: candidate.checkout_url }
  }

  throw new Error("Checkout preference claim returned an invalid response")
}

export async function completeCheckoutPreference(input: {
  orderNumber: string
  checkoutFingerprint: string
  leaseId: string
  preferenceId: string
  checkoutUrl: string
}): Promise<boolean> {
  validateIdentity(input.orderNumber, input.checkoutFingerprint, input.leaseId)
  if (
    !input.preferenceId ||
    input.preferenceId.length > 255 ||
    !input.checkoutUrl ||
    input.checkoutUrl.length > 2048
  ) {
    throw new Error("Invalid checkout preference completion")
  }

  const payload = await rpc("complete_checkout_preference", {
    p_order_number: input.orderNumber,
    p_checkout_fingerprint: input.checkoutFingerprint,
    p_lease_id: input.leaseId,
    p_preference_id: input.preferenceId,
    p_checkout_url: input.checkoutUrl,
  })

  if (typeof payload !== "boolean") {
    throw new Error("Checkout preference completion returned an invalid response")
  }
  return payload
}

export async function markCheckoutPreferenceError(input: {
  orderNumber: string
  leaseId: string
}): Promise<boolean> {
  if (!ORDER_NUMBER_PATTERN.test(input.orderNumber) || !UUID_PATTERN.test(input.leaseId)) {
    throw new Error("Invalid checkout preference error identity")
  }

  const payload = await rpc("mark_checkout_preference_error", {
    p_order_number: input.orderNumber,
    p_lease_id: input.leaseId,
  })

  if (typeof payload !== "boolean") {
    throw new Error("Checkout preference error update returned an invalid response")
  }
  return payload
}
