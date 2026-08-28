export interface ServerEnv {
  mercadoPagoAccessToken: string
  mercadoPagoWebhookSecret: string
  supabaseUrl: string
  supabaseSecretKey: string
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`)
  }
  return value
}

export function getServerEnv(): ServerEnv {
  const supabaseUrl = required("SUPABASE_URL")
  const parsedSupabaseUrl = new URL(supabaseUrl)

  if (parsedSupabaseUrl.protocol !== "https:") {
    throw new Error("SUPABASE_URL must use HTTPS")
  }

  return {
    mercadoPagoAccessToken: required("MERCADO_PAGO_ACCESS_TOKEN"),
    mercadoPagoWebhookSecret: required("MERCADO_PAGO_WEBHOOK_SECRET"),
    supabaseUrl: parsedSupabaseUrl.origin,
    supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
  }
}

export function resolvePublicSiteUrl(requestOrigin: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  const url = new URL(configured || requestOrigin)

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("Production checkout requires an HTTPS site URL")
  }

  return url.origin
}
