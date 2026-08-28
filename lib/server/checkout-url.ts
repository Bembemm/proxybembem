export type MercadoPagoEnvironment = "sandbox" | "production"

interface PreferenceCheckoutUrls {
  initPoint: string
  sandboxInitPoint?: string | null
}

export function selectMercadoPagoCheckoutUrl(
  preference: PreferenceCheckoutUrls,
  environment: MercadoPagoEnvironment,
) {
  if (environment === "sandbox") {
    if (!preference.sandboxInitPoint) {
      throw new Error("Mercado Pago did not return sandbox_init_point")
    }
    return preference.sandboxInitPoint
  }

  return preference.initPoint
}
