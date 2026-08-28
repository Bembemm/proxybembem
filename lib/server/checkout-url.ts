export type MercadoPagoEnvironment = "sandbox" | "production"

interface PreferenceCheckoutUrls {
  initPoint: string
  sandboxInitPoint?: string | null
}

export function selectMercadoPagoCheckoutUrl(
  preference: PreferenceCheckoutUrls,
  _environment: MercadoPagoEnvironment,
) {
  // Checkout Pro test mode is determined by the application's test credentials.
  // With automatic test credentials, the buyer should enter through init_point.
  return preference.initPoint
}
