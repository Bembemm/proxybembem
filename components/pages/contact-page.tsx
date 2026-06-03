"use client"

import { MessageCircle, Phone, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"

const contactInfo = [
  {
    icon: MessageCircle,
    label: "WhatsApp",
    value: "(44) 99910-7516",
    href: "https://wa.me/5544999107516",
  },
  {
    icon: Phone,
    label: "Telefone",
    value: "(44) 99910-7516",
    href: "tel:+5544999107516",
  },
  {
    icon: Mail,
    label: "E-mail",
    value: "contato@proxybembem.com.br",
    href: "mailto:contato@proxybembem.com.br",
  },
]

export function ContactPage() {
  return (
    <section className="relative pt-16 sm:pt-20 pb-8 sm:pb-12 min-h-screen">
      <div className="container mx-auto px-3 sm:px-4 relative z-10">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-[family-name:var(--font-display)] text-slate-900 mb-3 sm:mb-4 tracking-wide text-balance">
            Entre em Contato
          </h1>
          <div className="w-24 sm:w-32 mx-auto mb-3 sm:mb-4 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
          <p className="text-slate-700 max-w-xl mx-auto text-sm sm:text-base px-2 text-pretty">
            Tire suas dúvidas, faça seu pedido ou entre em contato conosco pelos canais abaixo.
          </p>
        </div>

        {/* Contact Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-8 sm:mb-12 max-w-3xl mx-auto">
          {contactInfo.map((info) => (
            <a
              key={info.label}
              href={info.href}
              target={info.href.startsWith("http") ? "_blank" : undefined}
              rel={info.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="bg-white/60 backdrop-blur-md border border-white/50 shadow-lg p-4 sm:p-5 md:p-6 text-center rounded-lg hover:shadow-xl transition-shadow block active:scale-[0.98]"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 bg-[#8B5CF6]/20 border border-[#8B5CF6]/50 flex items-center justify-center rounded-lg">
                <info.icon className="w-5 h-5 sm:w-6 sm:h-6 text-[#8B5CF6]" />
              </div>
              <h3 className="text-xs sm:text-sm font-semibold text-slate-900 mb-1 uppercase tracking-wider">
                {info.label}
              </h3>
              <p className="text-xs sm:text-sm text-slate-700 hover:text-[#8B5CF6] transition-colors break-all">
                {info.value}
              </p>
            </a>
          ))}
        </div>

        {/* Big WhatsApp Button */}
        <div className="max-w-md mx-auto px-2">
          <div className="bg-white/60 backdrop-blur-md border border-white/50 shadow-lg p-6 sm:p-8 md:p-10 text-center rounded-lg">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-[#8B5CF6]/20 border-2 border-[#8B5CF6]/50 flex items-center justify-center rounded-lg">
              <MessageCircle className="w-8 h-8 sm:w-10 sm:h-10 text-[#8B5CF6]" />
            </div>
            <h2 className="text-lg sm:text-xl md:text-2xl font-[family-name:var(--font-display)] text-slate-900 mb-3 sm:mb-4 tracking-wide text-balance">
              Fale Conosco Agora
            </h2>
            <p className="text-slate-700 mb-4 sm:mb-6 text-sm sm:text-base text-pretty">
              Clique no botão abaixo para iniciar uma conversa direta pelo WhatsApp.
            </p>
            <Button
              asChild
              size="lg"
              className="w-full bg-transparent border border-[#8B5CF6] text-[#8B5CF6] tracking-wide text-base sm:text-lg py-5 sm:py-6 hover:bg-[#8B5CF6] hover:text-white hover:border-[#8B5CF6] transition-colors duration-300 active:scale-[0.98]"
            >
              <a
                href="https://wa.me/5544999107516"
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                Falar no WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
