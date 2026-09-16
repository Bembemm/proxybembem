const isProductionDeployment = process.env.NODE_ENV === "production"

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

function resolveSupabaseProductImagePattern(origin) {
  if (!origin) return null
  const url = new URL(origin)
  return {
    protocol: "https",
    hostname: url.hostname,
    port: url.port,
    pathname: "/storage/v1/object/public/product-images/**",
  }
}

const supabaseBrowserOrigin = resolveSupabaseBrowserOrigin()
const supabaseProductImagePattern = resolveSupabaseProductImagePattern(
  supabaseBrowserOrigin,
)

const securityHeaders = [
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
  output: "standalone",
  images: {
    remotePatterns: supabaseProductImagePattern
      ? [supabaseProductImagePattern]
      : [],
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "proxybembem.com.br" }],
        destination: "https://www.proxybembem.com.br/:path*",
        permanent: true,
      },
    ]
  },
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
