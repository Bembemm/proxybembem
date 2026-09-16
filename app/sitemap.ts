import type { MetadataRoute } from "next"
import { isSandboxDeployment, resolveSeoSiteUrl } from "@/lib/seo"

const PUBLIC_CANONICAL_ROUTES = [
  "/",
  "/produtos",
  "/contato",
  "/privacidade",
  "/termos",
  "/trocas-e-reembolsos",
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  if (isSandboxDeployment()) return []

  const siteUrl = resolveSeoSiteUrl()
  return PUBLIC_CANONICAL_ROUTES.map((path) => ({
    url: new URL(path, siteUrl).toString(),
    changeFrequency: path === "/" || path === "/produtos" ? "weekly" : "monthly",
  }))
}
