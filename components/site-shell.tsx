"use client"

import { usePathname } from "next/navigation"
import { AnimatedBackground } from "@/components/animated-background"
import { CartPanel } from "@/components/cart-panel"
import { FaqSection } from "@/components/faq-section"
import { Footer } from "@/components/footer"
import { Navbar } from "@/components/navbar"
import { CartFloatingButton } from "@/components/whatsapp-button"
import { CartProvider } from "@/contexts/cart-context"

export function SiteShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/")

  if (isAdminRoute) {
    return <>{children}</>
  }

  return (
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
  )
}
