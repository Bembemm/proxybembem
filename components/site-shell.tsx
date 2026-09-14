"use client"

import { usePathname } from "next/navigation"
import { AnimatedBackground } from "@/components/animated-background"
import { CartPanel } from "@/components/cart-panel"
import { FaqSection } from "@/components/faq-section"
import { Footer } from "@/components/footer"
import { Navbar } from "@/components/navbar"
import { StoreNotice } from "@/components/store-notice"
import { CartFloatingButton } from "@/components/whatsapp-button"
import { CartProvider } from "@/contexts/cart-context"
import type { PublicStoreSettings } from "@/lib/store-settings/store-settings"

interface SiteShellProps {
  children: React.ReactNode
  storeSettings: PublicStoreSettings
}

export function SiteShell({ children, storeSettings }: Readonly<SiteShellProps>) {
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
        <StoreNotice
          noticeEnabled={storeSettings.noticeEnabled}
          noticeText={storeSettings.noticeText}
        />
        {children}
        <FaqSection
          productionLeadTimeBusinessDays={storeSettings.productionLeadTimeBusinessDays}
        />
        <Footer
          contactEmail={storeSettings.contactEmail}
          contactWhatsappE164={storeSettings.contactWhatsappE164}
        />
        <CartFloatingButton />
        <CartPanel contactWhatsappE164={storeSettings.contactWhatsappE164} />
      </main>
    </CartProvider>
  )
}
