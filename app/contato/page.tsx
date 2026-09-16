import type { Metadata } from "next"
import { ContactPage } from "@/components/pages/contact-page"
import { getPublicStoreSettings } from "@/lib/server/store-settings-cache"

export const metadata: Metadata = {
  title: "Contato",
  description: "Fale com a ProxyBembem pelo WhatsApp ou e-mail.",
  alternates: {
    canonical: "/contato",
  },
}

export default async function ContatoPage() {
  const storeSettings = await getPublicStoreSettings()

  return (
    <ContactPage
      contactEmail={storeSettings.contactEmail}
      contactWhatsappE164={storeSettings.contactWhatsappE164}
    />
  )
}
