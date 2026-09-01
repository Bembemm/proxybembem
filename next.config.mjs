const isProductionDeployment = process.env.VERCEL_ENV === "production"

function melhorEnvioFormActionOrigin() {
  if (process.env.MELHOR_ENVIO_ENVIRONMENT === "sandbox") {
    return "https://sandbox.melhorenvio.com.br"
  }
  if (process.env.MELHOR_ENVIO_ENVIRONMENT === "production") {
    return "https://melhorenvio.com.br"
  }
  return null
}

function resolveSupabaseBrowserOrigin() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!configuredUrl) return null

  try {
    const url = new URL(configuredUrl)
    return url.protocol === "https:" ? url.origin : null
  } catch {
    return null
  }
}

const melhorEnvioOAuthOrigin = melhorEnvioFormActionOrigin()
const supabaseBrowserOrigin = resolveSupabaseBrowserOrigin()

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  `form-action 'self'${melhorEnvioOAuthOrigin ? ` ${melhorEnvioOAuthOrigin}` : ""}`,
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  `connect-src 'self' https://vitals.vercel-insights.com${supabaseBrowserOrigin ? ` ${supabaseBrowserOrigin}` : ""}`,
  "upgrade-insecure-requests",
].join("; ")

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  ...(isProductionDeployment
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
