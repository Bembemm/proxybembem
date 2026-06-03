"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu, X, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PageType } from "@/app/page"

interface NavbarProps {
  currentPage: PageType
  setCurrentPage: (page: PageType) => void
}

export function Navbar({ currentPage, setCurrentPage }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false)

  const navItems: { label: string; page: PageType }[] = [
    { label: "Início", page: "inicio" },
    { label: "Produtos", page: "produtos" },
    { label: "Contato", page: "contato" },
  ]

  const handleNavClick = (page: PageType) => {
    setCurrentPage(page)
    setIsOpen(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-xl border-b border-slate-200/50 shadow-sm">
      <nav className="container mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between">
        <Link href="/" onClick={() => handleNavClick("inicio")} className="flex items-center gap-2">
          <div className="w-8 h-8 sm:w-9 sm:h-9 bg-[#8B5CF6]/20 border border-[#8B5CF6]/50 flex items-center justify-center fantasy-corners rounded">
            <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-[#8B5CF6]" />
          </div>
          <span className="text-lg sm:text-xl font-[family-name:var(--font-display)] text-slate-900 tracking-wide">
            ProxyBembem
          </span>
        </Link>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(!isOpen)}
          className="md:hidden text-slate-700 h-9 w-9"
          aria-label="Menu"
        >
          {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>

        <div className="hidden md:flex items-center gap-6 lg:gap-8">
          {navItems.map((item) => (
            <button
              key={item.page}
              onClick={() => handleNavClick(item.page)}
              className={`text-sm tracking-wide uppercase transition-colors ${
                currentPage === item.page
                  ? "text-[#8B5CF6] font-semibold"
                  : "text-slate-600 hover:text-[#8B5CF6]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {isOpen && (
        <div className="md:hidden bg-white/95 backdrop-blur-xl border-b border-slate-200/50 animate-in slide-in-from-top-2">
          <div className="container mx-auto px-3 sm:px-4 py-3 flex flex-col gap-1">
            {navItems.map((item) => (
              <button
                key={item.page}
                onClick={() => handleNavClick(item.page)}
                className={`py-3 px-2 text-sm tracking-wide uppercase text-left transition-colors rounded-lg ${
                  currentPage === item.page
                    ? "text-[#8B5CF6] font-semibold bg-[#8B5CF6]/10"
                    : "text-slate-600 hover:text-[#8B5CF6] hover:bg-slate-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}
