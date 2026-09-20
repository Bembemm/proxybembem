import type { MercadoPagoEnvironment } from "@/lib/server/checkout-url"

export interface SupabaseEnv {
  supabaseUrl: string
  supabaseSecretKey: string
}

export interface AdminAuthEnv {
  adminUserId: string
}

export interface MercadoPagoEnv {
  mercadoPagoAccessToken: string
  mercadoPagoWebhookSecret: string
  mercadoPagoEnvironment: MercadoPagoEnvironment
}

export type MelhorEnvioEnvironment = "sandbox" | "production"

export interface MelhorEnvioEnv {
  environment: MelhorEnvioEnvironment
  userAgent: string
  originCep: string
  quoteSecret: string
}

export interface MelhorEnvioOAuthEnv {
  environment: MelhorEnvioEnvironment
  clientId: string
  clientSecret: string
  redirectUri: string
  tokenEncryptionKey: string
  userAgent: string
  originCep: string
  quoteSecret: string
}


export interface RateLimitEnv extends SupabaseEnv {
  rateLimitSecret: string
  trustedProxyHops: number
}

export interface ServerEnv extends SupabaseEnv, MercadoPagoEnv {}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`)
  }
  return value
}

function requireStrongSecret(name: string) {
  const value = required(name)
  if (value.length < 32) {
    throw new Error(`${name} must contain at least 32 characters`)
  }
  return value
}

function trustedProxyHops() {
  const raw = process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS
  if (raw === undefined) return 0

  const value = raw.trim()
  if (!/^[0-5]$/.test(value)) {
    throw new Error("RATE_LIMIT_TRUSTED_PROXY_HOPS must be an integer from 0 to 5")
  }
  return Number(value)
}

function isProductionRuntime(nodeEnv: string | undefined) {
  return nodeEnv === "production"
}

function requiredProviderEnvironmentForDeployment() {
  const deployment = process.env.APP_ENVIRONMENT?.trim()
  if (!deployment || deployment === "production") return "production" as const
  if (deployment === "sandbox") return "sandbox" as const
  throw new Error("APP_ENVIRONMENT must be sandbox or production")
}

function requireProductionProviderEnvironment<T extends "sandbox" | "production">(
  providerName: string,
  environment: T,
): T {
  if (!isProductionRuntime(process.env.NODE_ENV)) return environment

  const requiredEnvironment = requiredProviderEnvironmentForDeployment()
  if (environment !== requiredEnvironment) {
    if (requiredEnvironment === "sandbox") {
      throw new Error(
        `Sandbox deployment requires ${providerName} environment to be sandbox`,
      )
    }
    throw new Error(
      `Production runtime requires ${providerName} environment to be production`,
    )
  }
  return environment
}

function mercadoPagoEnvironment(): MercadoPagoEnvironment {
  const value = required("MERCADO_PAGO_ENVIRONMENT")
  if (value !== "sandbox" && value !== "production") {
    throw new Error("MERCADO_PAGO_ENVIRONMENT must be sandbox or production")
  }
  return requireProductionProviderEnvironment("Mercado Pago", value)
}

function melhorEnvioEnvironment(): MelhorEnvioEnvironment {
  const value = required("MELHOR_ENVIO_ENVIRONMENT")
  if (value !== "sandbox" && value !== "production") {
    throw new Error("MELHOR_ENVIO_ENVIRONMENT must be sandbox or production")
  }
  return requireProductionProviderEnvironment("Melhor Envio", value)
}

function shippingOriginCep() {
  const originCep = required("SHIPPING_ORIGIN_CEP").replace(/\D/g, "")
  if (!/^\d{8}$/.test(originCep)) {
    throw new Error("SHIPPING_ORIGIN_CEP must contain exactly 8 digits")
  }
  return originCep
}

function shippingQuoteSecret() {
  return requireStrongSecret("SHIPPING_QUOTE_SECRET")
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

export function getAdminAuthEnv(): AdminAuthEnv {
  const adminUserId = required("ADMIN_USER_ID").toLowerCase()
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      adminUserId,
    )
  ) {
    throw new Error("ADMIN_USER_ID must be a canonical UUID")
  }
  return { adminUserId }
}

export function getMercadoPagoEnv(): MercadoPagoEnv {
  return {
    mercadoPagoAccessToken: required("MERCADO_PAGO_ACCESS_TOKEN"),
    mercadoPagoWebhookSecret: required("MERCADO_PAGO_WEBHOOK_SECRET"),
    mercadoPagoEnvironment: mercadoPagoEnvironment(),
  }
}

export function getMelhorEnvioOAuthEnv(): MelhorEnvioOAuthEnv {
  const environment = melhorEnvioEnvironment()
  const redirectUri = required("MELHOR_ENVIO_REDIRECT_URI")

  let parsedRedirectUri: URL
  try {
    parsedRedirectUri = new URL(redirectUri)
  } catch {
    throw new Error("MELHOR_ENVIO_REDIRECT_URI must be a valid absolute URL")
  }

  if (environment === "production" && parsedRedirectUri.protocol !== "https:") {
    throw new Error("Production MELHOR_ENVIO_REDIRECT_URI must use HTTPS")
  }

  const tokenEncryptionKey = required("MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY")
  if (!/^[0-9a-fA-F]{64}$/.test(tokenEncryptionKey)) {
    throw new Error(
      "MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters",
    )
  }

  return {
    environment,
    clientId: required("MELHOR_ENVIO_CLIENT_ID"),
    clientSecret: required("MELHOR_ENVIO_CLIENT_SECRET"),
    redirectUri,
    tokenEncryptionKey,
    userAgent: required("MELHOR_ENVIO_USER_AGENT"),
    originCep: shippingOriginCep(),
    quoteSecret: shippingQuoteSecret(),
  }
}


export function getCronSecret() {
  return requireStrongSecret("CRON_SECRET")
}

export function getResendWebhookSecret() {
  return requireStrongSecret("RESEND_WEBHOOK_SECRET")
}

export function getMelhorEnvioEnv(): MelhorEnvioEnv {
  return {
    environment: melhorEnvioEnvironment(),
    userAgent: required("MELHOR_ENVIO_USER_AGENT"),
    originCep: shippingOriginCep(),
    quoteSecret: shippingQuoteSecret(),
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
    trustedProxyHops: trustedProxyHops(),
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
  const production = isProductionRuntime(process.env.NODE_ENV)

  if (production && !configured) {
    throw new Error("Production checkout requires NEXT_PUBLIC_SITE_URL")
  }

  const url = new URL(configured || requestOrigin)
  if (production && url.protocol !== "https:") {
    throw new Error("Production checkout requires an HTTPS site URL")
  }

  return url.origin
}

export function isAllowedCheckoutOrigin(input: {
  originHeader: string | null
  configuredSiteUrl: string
  requestOrigin: string
  nodeEnv: string | undefined
}) {
  if (!input.originHeader) return false

  try {
    const origin = new URL(input.originHeader).origin
    const configuredOrigin = new URL(input.configuredSiteUrl).origin
    const requestOrigin = new URL(input.requestOrigin).origin
    const production = isProductionRuntime(input.nodeEnv)

    if (production) {
      return (
        new URL(input.configuredSiteUrl).protocol === "https:" &&
        origin === configuredOrigin
      )
    }

    return origin === configuredOrigin || origin === requestOrigin
  } catch {
    return false
  }
}
