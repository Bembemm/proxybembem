import { AnimatedBackground } from "@/components/animated-background"
import { FaqSection } from "@/components/faq-section"
import { Footer } from "@/components/footer"
import { Navbar } from "@/components/navbar"
import { SiteShellRouter } from "@/components/site-shell-router"
import { StoreNotice } from "@/components/store-notice"
import { WhatsAppFloatingButton } from "@/components/whatsapp-button"
import type { PublicStoreSettings } from "@/lib/store-settings/store-settings"

interface SiteShellProps {
  children: React.ReactNode
  storeSettings: PublicStoreSettings
}

export function SiteShell({ children, storeSettings }: Readonly<SiteShellProps>) {
  return (
    <SiteShellRouter
      storefrontBefore={
        <>
          <AnimatedBackground />
          <Navbar />
          <StoreNotice
            noticeEnabled={storeSettings.noticeEnabled}
            noticeText={storeSettings.noticeText}
          />
        </>
      }
      storefrontAfter={
        <>
          <FaqSection
            productionLeadTimeBusinessDays={storeSettings.productionLeadTimeBusinessDays}
          />
          <Footer
            contactEmail={storeSettings.contactEmail}
            contactWhatsappE164={storeSettings.contactWhatsappE164}
          />
          <WhatsAppFloatingButton contactWhatsappE164={storeSettings.contactWhatsappE164} />
        </>
      }
    >
      {children}
    </SiteShellRouter>
  )
}
