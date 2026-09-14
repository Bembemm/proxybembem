import type { Metadata, Viewport } from "next"
import { Crimson_Text, MedievalSharp } from "next/font/google"
import { SiteShell } from "@/components/site-shell"
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

export const metadata: Metadata = {
  title: {
    default: "ProxyBembem | Decks e Proxies de Alta Qualidade para TCG",
    template: "%s | ProxyBembem",
  },
  description:
    "Decks completos, cartas avulsas e proxies de alta qualidade para Commander, Modern e outros formatos. Envio para todo o Brasil.",
  icons: {
    icon: "/brand/pb",
    apple: "/brand/pb",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#8B5CF6",
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const storeSettings = await getPublicStoreSettings()

  return (
    <html lang="pt-BR" className={`${medievalSharp.variable} ${crimsonText.variable} bg-slate-50`}>
      <body className="font-serif antialiased bg-slate-50 min-h-screen overflow-x-hidden">
        <SiteShell storeSettings={storeSettings}>{children}</SiteShell>
      </body>
    </html>
  )
}
