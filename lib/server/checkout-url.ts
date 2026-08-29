export type MercadoPagoEnvironment = "sandbox" | "production"

interface PreferenceCheckoutUrls {
  initPoint: string
  sandboxInitPoint?: string | null
}

const ALLOWED_MERCADO_PAGO_HOSTS = ["mercadopago.com", "mercadopago.com.br"] as const

function isAllowedHostname(hostname: string) {
  const normalized = hostname.toLowerCase()
  return ALLOWED_MERCADO_PAGO_HOSTS.some(
    (allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`),
  )
}

export function isAllowedMercadoPagoCheckoutUrl(value: string): boolean {
  if (typeof value !== "string" || value.length < 1 || value.length > 4096) return false

  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      isAllowedHostname(url.hostname)
    )
  } catch {
    return false
  }
}

export function selectMercadoPagoCheckoutUrl(
  preference: PreferenceCheckoutUrls,
  _environment: MercadoPagoEnvironment,
) {
  // Checkout Pro test mode is determined by the application's credentials.
  // Both test-account and production flows enter through init_point.
  if (!isAllowedMercadoPagoCheckoutUrl(preference.initPoint)) {
    throw new Error("Mercado Pago returned an unsafe checkout URL")
  }
  return preference.initPoint
}
