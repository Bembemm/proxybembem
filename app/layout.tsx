import type { Metadata, Viewport } from "next"
import { Crimson_Text, MedievalSharp } from "next/font/google"
import { headers } from "next/headers"
import { SiteShell } from "@/components/site-shell"
import { resolveSeoSiteUrl, isSandboxDeployment } from "@/lib/seo"
import { getPublicStoreSettings } from "@/lib/server/store-settings-cache"
import "./globals.css"

const medievalSharp = MedievalSharp({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-medieval",
})

const crimsonText = Crimson_Text({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-crimson",
})

const siteTitle = "ProxyBembem | Decks e Proxies de Alta Qualidade para TCG"
const siteDescription =
  "Decks completos, cartas avulsas e proxies de alta qualidade para Commander, Modern e outros formatos. Envio para todo o Brasil."

export const metadata: Metadata = {
  metadataBase: resolveSeoSiteUrl(),
  title: {
    default: siteTitle,
    template: "%s | ProxyBembem",
  },
  description: siteDescription,
  icons: {
    icon: "/brand/pb",
    apple: "/brand/pb",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "ProxyBembem",
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: "/brand/pb",
        width: 192,
        height: 192,
        alt: "ProxyBembem",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
    images: ["/brand/pb"],
  },
  robots: isSandboxDeployment()
    ? {
        index: false,
        follow: false,
        noarchive: true,
      }
    : undefined,
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#8B5CF6",
  colorScheme: "light",
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [, storeSettings] = await Promise.all([
    headers(),
    getPublicStoreSettings(),
  ])

  return (
    <html lang="pt-BR" className={`${medievalSharp.variable} ${crimsonText.variable} bg-slate-50`}>
      <body className="font-serif antialiased bg-slate-50 min-h-screen overflow-x-hidden">
        <SiteShell storeSettings={storeSettings}>{children}</SiteShell>
      </body>
    </html>
  )
}
