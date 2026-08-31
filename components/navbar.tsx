"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const navItems = [
  { label: "Início", href: "/" },
  { label: "Produtos", href: "/#produtos" },
  { label: "Contato", href: "/contato" },
] as const

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href.includes("#")) return false
    return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-xl border-b border-slate-200/50 shadow-sm">
      <nav className="container mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between" aria-label="Navegação principal">
        <Link href="/" className="flex items-center gap-2" onClick={() => setIsOpen(false)}>
          <img src="/brand/pb.png" alt="" aria-hidden="true" className="h-10 sm:h-12 w-auto object-contain" />
          <span className="text-xl sm:text-2xl font-[family-name:var(--font-display)] text-black tracking-wide">
            ProxyBembem
          </span>
        </Link>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen((current) => !current)}
          className="md:hidden text-slate-700 h-9 w-9"
          aria-label={isOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={isOpen}
          aria-controls="mobile-navigation"
        >
          {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>

        <div className="hidden md:flex items-center gap-6 lg:gap-8">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`text-base tracking-wide uppercase transition-colors ${
                isActive(item.href)
                  ? "text-[#8B5CF6] font-semibold"
                  : "text-slate-600 hover:text-[#8B5CF6]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {isOpen && (
        <div
          id="mobile-navigation"
          className="md:hidden bg-white/95 backdrop-blur-xl border-b border-slate-200/50 animate-in slide-in-from-top-2"
        >
          <div className="container mx-auto px-3 sm:px-4 py-3 flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`py-3 px-2 text-base tracking-wide uppercase text-left transition-colors rounded-lg ${
                  isActive(item.href)
                    ? "text-[#8B5CF6] font-semibold bg-[#8B5CF6]/10"
                    : "text-slate-600 hover:text-[#8B5CF6] hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}
