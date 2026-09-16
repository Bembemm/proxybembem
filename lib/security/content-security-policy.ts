function httpsOrigin(value: string | undefined) {
  if (!value?.trim()) return null

  try {
    const url = new URL(value.trim())
    return url.protocol === "https:" ? url.origin : null
  } catch {
    return null
  }
}

function melhorEnvioOrigin(environment: string | undefined) {
  if (environment === "sandbox") return "https://sandbox.melhorenvio.com.br"
  if (environment === "production") return "https://melhorenvio.com.br"
  return null
}

export function createCspNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Buffer.from(bytes).toString("base64")
}

export function buildContentSecurityPolicy(input: {
  nonce: string
  nodeEnv: string | undefined
  melhorEnvioEnvironment: string | undefined
  supabaseBrowserUrl: string | undefined
}) {
  const supabaseOrigin = httpsOrigin(input.supabaseBrowserUrl)
  const formOrigin = melhorEnvioOrigin(input.melhorEnvioEnvironment)
  const scriptSources = [
    "'self'",
    `'nonce-${input.nonce}'`,
    "'strict-dynamic'",
    ...(input.nodeEnv === "development" ? ["'unsafe-eval'"] : []),
  ]

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `form-action 'self'${formOrigin ? ` ${formOrigin}` : ""}`,
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSources.join(" ")}`,
    `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    "upgrade-insecure-requests",
  ].join("; ")
}
