"use client"

import Link from "next/link"
import { Instagram, Lock, Mail } from "lucide-react"

interface FooterProps {
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

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  )
}

export function Footer({ contactEmail, contactWhatsappE164 }: FooterProps) {
  const whatsappHref = contactWhatsappE164
    ? `https://wa.me/${contactWhatsappE164.replace(/^\+/, "")}`
    : null

  return (
    <footer className="relative bg-white/60 backdrop-blur-md border-t border-slate-200/50 shadow-sm">
      <div className="container mx-auto px-3 sm:px-4 py-8 sm:py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <img src="/brand/pb" alt="" aria-hidden="true" className="h-10 sm:h-12 w-auto object-contain" />
              <span className="text-xl sm:text-2xl font-[family-name:var(--font-display)] text-black tracking-wide">
                ProxyBembem
              </span>
            </div>
            <div className="flex gap-3 sm:gap-4">
              <a
                href="https://www.instagram.com/proxybembem/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-[#8B5CF6]/20 hover:border-[#8B5CF6]/50 hover:text-[#8B5CF6] transition-all duration-300 rounded active:scale-95"
                aria-label="Instagram da ProxyBembem"
              >
                <Instagram className="w-4 h-4 sm:w-5 sm:h-5" />
              </a>
              <a
                href="https://www.tiktok.com/@proxybembem"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-[#8B5CF6]/20 hover:border-[#8B5CF6]/50 hover:text-[#8B5CF6] transition-all duration-300 rounded active:scale-95"
                aria-label="TikTok da ProxyBembem"
              >
                <TikTokIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              </a>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <p className="text-base sm:text-lg text-slate-700 leading-relaxed text-center max-w-xs">
              Sua loja de proxies para TCG. Qualidade premium com os melhores preços do mercado.
            </p>
          </div>

          <div className="md:text-right">
            <h3 className="font-[family-name:var(--font-display)] text-black mb-3 sm:mb-4 tracking-wide text-lg sm:text-xl">
              Contato
            </h3>
            <div className="w-10 sm:w-12 h-px bg-[#8B5CF6]/40 mb-3 sm:mb-4 md:ml-auto" />
            <ul className="space-y-2 sm:space-y-3">
              {contactEmail ? (
                <li>
                  <a
                    href={`mailto:${contactEmail}`}
                    className="flex items-center gap-2 text-base sm:text-lg text-slate-700 hover:text-purple-500 transition-colors md:justify-end"
                  >
                    <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-[#8B5CF6] shrink-0" />
                    <span className="break-all">{contactEmail}</span>
                  </a>
                </li>
              ) : null}
              {contactWhatsappE164 ? (
                <li>
                  <a
                    href={whatsappHref ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-base sm:text-lg text-slate-700 hover:text-purple-500 transition-colors md:justify-end"
                  >
                    <WhatsAppIcon className="w-4 h-4 sm:w-5 sm:h-5 text-[#8B5CF6] shrink-0" />
                    {contactWhatsappE164}
                  </a>
                </li>
              ) : null}
              {!contactEmail && !contactWhatsappE164 ? (
                <li className="text-base sm:text-lg text-slate-500">Contato indisponível no momento.</li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-200/50 mt-8 sm:mt-12 pt-6 sm:pt-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-[#8B5CF6]/70" />
            <p className="text-base text-slate-500 text-center">
              Pagamento processado pelo Mercado Pago. Dados bancários e do cartão não são armazenados pela ProxyBembem.
            </p>
          </div>

          <nav
            aria-label="Políticas da loja"
            className="mb-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm sm:text-base"
          >
            <Link className="text-slate-500 hover:text-[#8B5CF6] transition-colors" href="/privacidade">
              Privacidade
            </Link>
            <Link className="text-slate-500 hover:text-[#8B5CF6] transition-colors" href="/termos">
              Termos
            </Link>
            <Link
              className="text-slate-500 hover:text-[#8B5CF6] transition-colors"
              href="/trocas-e-reembolsos"
            >
              Trocas e reembolsos
            </Link>
          </nav>

          <p className="text-base sm:text-lg text-slate-500 text-center">
            © {new Date().getFullYear()} ProxyBembem. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}
