const CANONICAL_PRODUCTION_SITE_URL = "https://www.proxybembem.com.br"

export function isSandboxDeployment() {
  return process.env.APP_ENVIRONMENT?.trim() === "sandbox"
}

export function resolveSeoSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!configured) return new URL(CANONICAL_PRODUCTION_SITE_URL)

  try {
    const url = new URL(configured)
    if (url.protocol !== "https:") {
      return new URL(CANONICAL_PRODUCTION_SITE_URL)
    }
    return new URL(url.origin)
  } catch {
    return new URL(CANONICAL_PRODUCTION_SITE_URL)
  }
}
