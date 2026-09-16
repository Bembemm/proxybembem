import type { MetadataRoute } from "next"
import { isSandboxDeployment, resolveSeoSiteUrl } from "@/lib/seo"

export default function robots(): MetadataRoute.Robots {
  if (isSandboxDeployment()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    }
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/minha-conta/", "/api/", "/auth/", "/checkout"],
    },
    sitemap: new URL("/sitemap.xml", resolveSeoSiteUrl()).toString(),
  }
}
