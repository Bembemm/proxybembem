"use client"

import { Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { buildWhatsAppOrderUrl } from "@/lib/checkout"

interface ContactPageProps {
  contactEmail: string | null
  contactWhatsappE164: string | null
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

export function ContactPage({ contactEmail, contactWhatsappE164 }: ContactPageProps) {
  const whatsappUrl = buildWhatsAppOrderUrl(
    contactWhatsappE164,
    "Olá! Vim pelo site e gostaria de saber mais sobre os proxies.",
  )
  const emailUrl = contactEmail
    ? `mailto:${contactEmail}?subject=${encodeURIComponent("Contato via Site - ProxyBemBem")}&body=${encodeURIComponent("Olá, gostaria de falar sobre...")}`
    : null
  const hasContactChannel = Boolean(whatsappUrl || emailUrl)

  return (
    <section className="relative pt-16 sm:pt-20 pb-8 sm:pb-12">
      <div className="container mx-auto px-3 sm:px-4 relative z-10">
        <div className="text-center mb-6 sm:mb-10">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-[family-name:var(--font-display)] text-slate-900 mb-3 sm:mb-4 tracking-wide text-balance">
            Entre em Contato
          </h1>
          <div className="w-24 sm:w-32 mx-auto mb-3 sm:mb-4 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
          <p className="text-slate-700 max-w-xl mx-auto text-lg sm:text-xl px-2 text-pretty">
            Tire suas dúvidas, faça seu pedido ou entre em contato conosco pelos canais abaixo.
          </p>
        </div>

        {hasContactChannel ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-4xl mx-auto px-2">
            {whatsappUrl ? (
              <div className="bg-white/60 backdrop-blur-md border border-white/50 shadow-lg p-6 sm:p-8 md:p-10 text-center rounded-lg flex flex-col">
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-[#8B5CF6]/20 border-2 border-[#8B5CF6]/50 flex items-center justify-center rounded-lg">
                  <WhatsAppIcon className="w-8 h-8 sm:w-10 sm:h-10 text-[#8B5CF6]" />
                </div>
                <h2 className="text-xl sm:text-2xl md:text-3xl font-[family-name:var(--font-display)] text-slate-900 mb-3 sm:mb-4 tracking-wide text-balance">
                  Fale pelo WhatsApp
                </h2>
                <p className="text-slate-700 mb-4 sm:mb-6 text-lg sm:text-xl text-pretty flex-grow">
                  Atendimento rápido e direto. Faça seu pedido ou tire dúvidas.
                </p>
                <Button
                  asChild
                  size="lg"
                  className="w-full bg-transparent border border-[#8B5CF6] text-[#8B5CF6] tracking-wide text-lg sm:text-xl h-14 sm:h-16 hover:bg-[#8B5CF6] hover:text-white hover:border-[#8B5CF6] transition-colors duration-300 active:scale-[0.98]"
                >
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                    <WhatsAppIcon className="w-6 h-6 mr-2" />
                    Falar no WhatsApp
                  </a>
                </Button>
              </div>
            ) : null}

            {contactEmail ? (
              <div className="bg-white/60 backdrop-blur-md border border-white/50 shadow-lg p-6 sm:p-8 md:p-10 text-center rounded-lg flex flex-col">
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-[#8B5CF6]/20 border-2 border-[#8B5CF6]/50 flex items-center justify-center rounded-lg">
                  <Mail className="w-8 h-8 sm:w-10 sm:h-10 text-[#8B5CF6]" />
                </div>
                <h2 className="text-xl sm:text-2xl md:text-3xl font-[family-name:var(--font-display)] text-slate-900 mb-3 sm:mb-4 tracking-wide text-balance">
                  Envie um E-mail
                </h2>
                <p className="text-slate-700 mb-4 sm:mb-6 text-lg sm:text-xl text-pretty flex-grow">
                  Prefere formalizar? Envie sua lista ou dúvidas por e-mail.
                </p>
                <Button
                  asChild
                  size="lg"
                  className="w-full bg-transparent border border-[#8B5CF6] text-[#8B5CF6] tracking-wide text-lg sm:text-xl h-14 sm:h-16 hover:bg-[#8B5CF6] hover:text-white hover:border-[#8B5CF6] transition-colors duration-300 active:scale-[0.98]"
                >
                  <a href={emailUrl ?? undefined}>
                    <Mail className="w-6 h-6 mr-2" />
                    Enviar E-mail
                  </a>
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white/60 p-6 text-center text-slate-600 shadow-sm">
            Os canais de contato estão temporariamente indisponíveis. Tente novamente mais tarde.
          </div>
        )}
      </div>
    </section>
  )
}
