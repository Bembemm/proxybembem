import type { MercadoPagoEnvironment } from "@/lib/server/checkout-url"

export interface SupabaseEnv {
  supabaseUrl: string
  supabaseSecretKey: string
}

export interface MercadoPagoEnv {
  mercadoPagoAccessToken: string
  mercadoPagoWebhookSecret: string
  mercadoPagoEnvironment: MercadoPagoEnvironment
}

export interface ServerEnv extends SupabaseEnv, MercadoPagoEnv {}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`)
  }
  return value
}

function mercadoPagoEnvironment(): MercadoPagoEnvironment {
  const value = required("MERCADO_PAGO_ENVIRONMENT")
  if (value !== "sandbox" && value !== "production") {
    throw new Error("MERCADO_PAGO_ENVIRONMENT must be sandbox or production")
  }
  return value
}

export function getSupabaseEnv(): SupabaseEnv {
  const supabaseUrl = required("SUPABASE_URL")
  const parsedSupabaseUrl = new URL(supabaseUrl)

  if (parsedSupabaseUrl.protocol !== "https:") {
    throw new Error("SUPABASE_URL must use HTTPS")
  }

  return {
    supabaseUrl: parsedSupabaseUrl.origin,
    supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
  }
}

export function getMercadoPagoEnv(): MercadoPagoEnv {
  return {
    mercadoPagoAccessToken: required("MERCADO_PAGO_ACCESS_TOKEN"),
    mercadoPagoWebhookSecret: required("MERCADO_PAGO_WEBHOOK_SECRET"),
    mercadoPagoEnvironment: mercadoPagoEnvironment(),
  }
}

export function getServerEnv(): ServerEnv {
  return {
    ...getSupabaseEnv(),
    ...getMercadoPagoEnv(),
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

export function isAllowedCheckoutOrigin(
  originHeader: string | null,
  configuredSiteUrl: string,
  requestOrigin: string,
) {
  if (!originHeader) return true

  try {
    const origin = new URL(originHeader).origin
    return (
      origin === new URL(configuredSiteUrl).origin ||
      origin === new URL(requestOrigin).origin
    )
  } catch {
    return false
  }
}
