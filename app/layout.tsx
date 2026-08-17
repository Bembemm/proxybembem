import type { Metadata, Viewport } from "next"
import { Crimson_Text, MedievalSharp } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { AnimatedBackground } from "@/components/animated-background"
import { CartPanel } from "@/components/cart-panel"
import { FaqSection } from "@/components/faq-section"
import { Footer } from "@/components/footer"
import { Navbar } from "@/components/navbar"
import { CartFloatingButton } from "@/components/whatsapp-button"
import { CartProvider } from "@/contexts/cart-context"
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
    icon: "/icon.svg",
    apple: "/apple-icon.png",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#8B5CF6",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${medievalSharp.variable} ${crimsonText.variable} bg-slate-50`}>
      <body className="font-serif antialiased bg-slate-50 min-h-screen overflow-x-hidden">
        <CartProvider>
          <main className="min-h-screen relative w-full overflow-x-hidden">
            <AnimatedBackground />
            <Navbar />
            {children}
            <FaqSection />
            <Footer />
            <CartFloatingButton />
            <CartPanel />
          </main>
        </CartProvider>
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
