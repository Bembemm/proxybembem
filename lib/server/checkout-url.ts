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
  // Checkout Pro test mode is determined by the application's test credentials.
  // With automatic test credentials, the buyer should enter through init_point.
  return preference.initPoint
}
