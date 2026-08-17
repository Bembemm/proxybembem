import type { Metadata } from "next"
import { ContactPage } from "@/components/pages/contact-page"

export const metadata: Metadata = {
  title: "Contato",
  description: "Fale com a ProxyBembem pelo WhatsApp ou e-mail.",
}

export default function ContatoPage() {
  return <ContactPage />
}
