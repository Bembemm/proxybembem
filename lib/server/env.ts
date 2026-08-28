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

export type MelhorEnvioEnvironment = "sandbox" | "production"

export interface MelhorEnvioEnv {
  environment: MelhorEnvioEnvironment
  accessToken: string
  userAgent: string
  originCep: string
  quoteSecret: string
}

export interface RateLimitEnv extends SupabaseEnv {
  rateLimitSecret: string
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

function melhorEnvioEnvironment(): MelhorEnvioEnvironment {
  const value = required("MELHOR_ENVIO_ENVIRONMENT")
  if (value !== "sandbox" && value !== "production") {
    throw new Error("MELHOR_ENVIO_ENVIRONMENT must be sandbox or production")
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

export function getMelhorEnvioEnv(): MelhorEnvioEnv {
  const originCep = required("SHIPPING_ORIGIN_CEP").replace(/\D/g, "")
  if (!/^\d{8}$/.test(originCep)) {
    throw new Error("SHIPPING_ORIGIN_CEP must contain exactly 8 digits")
  }

  const quoteSecret = required("SHIPPING_QUOTE_SECRET")
  if (quoteSecret.length < 32) {
    throw new Error("SHIPPING_QUOTE_SECRET must contain at least 32 characters")
  }

  return {
    environment: melhorEnvioEnvironment(),
    accessToken: required("MELHOR_ENVIO_ACCESS_TOKEN"),
    userAgent: required("MELHOR_ENVIO_USER_AGENT"),
    originCep,
    quoteSecret,
  }
}

export function getRateLimitEnv(): RateLimitEnv {
  const rateLimitSecret = required("RATE_LIMIT_SECRET")
  if (rateLimitSecret.length < 32) {
    throw new Error("RATE_LIMIT_SECRET must contain at least 32 characters")
  }

  return {
    ...getSupabaseEnv(),
    rateLimitSecret,
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
