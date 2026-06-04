import type { Metadata, Viewport } from 'next'
import { MedievalSharp, Crimson_Text } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const medievalSharp = MedievalSharp({ 
  weight: "400",
  subsets: ["latin"],
  variable: "--font-medieval"
});
const crimsonText = Crimson_Text({ 
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-crimson"
});

export const metadata: Metadata = {
  title: 'ProxyBembem | Decks e Proxies de Alta Qualidade para TCG',
  description: 'Aqui você encontra tudo para jogar. Decks completos, cartas avulsas e proxies de alta qualidade para Commander, Modern e mais. Envio para todo o Brasil.',
  generator: 'v0.app',
  icons: { icon: '/favicon.png' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#8B5CF6',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${medievalSharp.variable} ${crimsonText.variable} bg-slate-50`}>
      <body className="font-serif antialiased bg-slate-50 min-h-screen overflow-x-hidden">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
