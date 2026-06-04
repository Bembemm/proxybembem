"use client"

import Link from "next/link"
import { Instagram, Mail, Phone, Lock } from "lucide-react"

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  )
}

export function Footer() {
  return (
    <footer id="contato" className="relative bg-white/60 backdrop-blur-md border-t border-slate-200/50 shadow-sm">
      <div className="container mx-auto px-3 sm:px-4 py-8 sm:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
          {/* Logo e descrição */}
          <div>
            <Link href="/" className="flex items-center gap-2 mb-3 sm:mb-4">
              <img src="/logo.svg" alt="Logo PB" className="h-10 w-auto object-contain" />
              <span className="text-lg sm:text-xl font-[family-name:var(--font-display)] text-black tracking-wide">
                ProxyBembem
              </span>
            </Link>
            <p className="text-xs sm:text-sm text-slate-700 mb-3 sm:mb-4 leading-relaxed max-w-xs">
              Sua loja de proxies para TCG. Qualidade premium com os melhores preços do mercado.
            </p>
            <div className="flex gap-3 sm:gap-4">
              <a
                href="https://instagram.com/proxycards"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-[#8B5CF6]/20 hover:border-[#8B5CF6]/50 hover:text-[#8B5CF6] transition-all duration-300 rounded active:scale-95"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4 sm:w-5 sm:h-5" />
              </a>
              <a
                href="https://tiktok.com/@proxycards"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-[#8B5CF6]/20 hover:border-[#8B5CF6]/50 hover:text-[#8B5CF6] transition-all duration-300 rounded active:scale-95"
                aria-label="TikTok"
              >
                <TikTokIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              </a>
            </div>
          </div>

          {/* Contato */}
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-black mb-3 sm:mb-4 tracking-wide text-base sm:text-lg">Contato</h3>
            <div className="w-10 sm:w-12 h-px bg-[#8B5CF6]/40 mb-3 sm:mb-4" />
            <ul className="space-y-2 sm:space-y-3">
              <li className="flex items-center gap-2 text-xs sm:text-sm text-slate-700">
                <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#8B5CF6] shrink-0" />
                <span className="break-all">contato@proxybembem.com.br</span>
              </li>
              <li className="flex items-center gap-2 text-xs sm:text-sm text-slate-700">
                <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#8B5CF6] shrink-0" />
                (44) 99910-7516
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-200/50 mt-8 sm:mt-12 pt-6 sm:pt-8">
          {/* Selo de Segurança */}
          <div className="flex items-center justify-center gap-2 mb-4 sm:mb-6">
            <Lock className="w-3.5 h-3.5 text-[#8B5CF6]/70" />
            <p className="text-xs text-slate-500">
              Pagamento 100% Seguro via Pix. Seus dados estão protegidos.
            </p>
          </div>
          
          <p className="text-xs sm:text-sm text-slate-500 text-center">
            © {new Date().getFullYear()} ProxyBembem. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}
