"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, ShoppingCart, UserRound, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/contexts/cart-context"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

const navItems = [
  { label: "Produtos", href: "/produtos", freshDocument: true },
  { label: "Contato", href: "/contato", freshDocument: false },
] as const

type AccountState = "loading" | "guest" | "authenticated"

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const [accountState, setAccountState] = useState<AccountState>("loading")
  const pathname = usePathname()
  const { totalItems, setIsCartOpen } = useCart()

  useEffect(() => {
    let cancelled = false
    const supabase = createSupabaseBrowserClient()

    setAccountState("loading")
    void supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setAccountState("guest")
        return
      }
      setAccountState(data.user ? "authenticated" : "guest")
    })

    return () => {
      cancelled = true
    }
  }, [pathname])

  const accountItem =
    accountState === "loading"
      ? null
      : accountState === "authenticated"
        ? { label: "Meu perfil", href: "/minha-conta/perfil" }
        : { label: "Entrar", href: "/entrar" }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  const cartButton = (
    <button
      type="button"
      onClick={() => setIsCartOpen(true)}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-100 hover:text-[#8B5CF6]"
      aria-label="Abrir carrinho"
    >
      <ShoppingCart className="h-5 w-5" />
      {totalItems > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#8B5CF6] px-1 text-[11px] font-bold leading-none text-white">
          {totalItems > 99 ? "99+" : totalItems}
        </span>
      ) : null}
    </button>
  )

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-slate-200/70 bg-white/90 shadow-sm backdrop-blur-xl">
      <nav className="container mx-auto flex h-14 items-center justify-between px-3 sm:h-16 sm:px-4" aria-label="Navegação principal">
        <a href="/" className="flex items-center gap-2" onClick={() => setIsOpen(false)}>
          <img src="/brand/pb" alt="" aria-hidden="true" className="h-10 w-auto object-contain sm:h-12" />
          <span className="hidden text-xl tracking-wide text-black sm:inline sm:text-2xl font-[family-name:var(--font-display)]">
            ProxyBembem
          </span>
        </a>

        <div className="hidden items-center gap-6 md:flex lg:gap-8">
          {navItems.map((item) =>
            item.freshDocument ? (
              <a
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`text-base uppercase tracking-wide transition-colors ${
                  isActive(item.href)
                    ? "font-semibold text-[#8B5CF6]"
                    : "text-slate-600 hover:text-[#8B5CF6]"
                }`}
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`text-base uppercase tracking-wide transition-colors ${
                  isActive(item.href)
                    ? "font-semibold text-[#8B5CF6]"
                    : "text-slate-600 hover:text-[#8B5CF6]"
                }`}
              >
                {item.label}
              </Link>
            ),
          )}

          <div className="ml-1 flex items-center gap-1 border-l border-slate-200 pl-4">
            {accountItem ? (
              <Link
                href={accountItem.href}
                aria-current={isActive(accountItem.href) ? "page" : undefined}
                aria-label={accountItem.label}
                title={accountItem.label}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                  isActive(accountItem.href)
                    ? "bg-[#8B5CF6]/10 text-[#8B5CF6]"
                    : "text-slate-700 hover:bg-slate-100 hover:text-[#8B5CF6]"
                }`}
              >
                <UserRound className="h-5 w-5" />
              </Link>
            ) : (
              <span className="h-10 w-10" aria-hidden="true" />
            )}
            {cartButton}
          </div>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          {accountItem ? (
            <Link
              href={accountItem.href}
              onClick={() => setIsOpen(false)}
              aria-label={accountItem.label}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100"
            >
              <UserRound className="h-5 w-5" />
            </Link>
          ) : null}
          {cartButton}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen((current) => !current)}
            className="h-9 w-9 text-slate-700"
            aria-label={isOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={isOpen}
            aria-controls="mobile-navigation"
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </nav>

      {isOpen ? (
        <div
          id="mobile-navigation"
          className="border-b border-slate-200/50 bg-white/95 backdrop-blur-xl md:hidden animate-in slide-in-from-top-2"
        >
          <div className="container mx-auto flex flex-col gap-1 px-3 py-3 sm:px-4">
            {navItems.map((item) =>
              item.freshDocument ? (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`rounded-lg px-2 py-3 text-left text-base uppercase tracking-wide transition-colors ${
                    isActive(item.href)
                      ? "bg-[#8B5CF6]/10 font-semibold text-[#8B5CF6]"
                      : "text-slate-600 hover:bg-slate-100 hover:text-[#8B5CF6]"
                  }`}
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`rounded-lg px-2 py-3 text-left text-base uppercase tracking-wide transition-colors ${
                    isActive(item.href)
                      ? "bg-[#8B5CF6]/10 font-semibold text-[#8B5CF6]"
                      : "text-slate-600 hover:bg-slate-100 hover:text-[#8B5CF6]"
                  }`}
                >
                  {item.label}
                </Link>
              ),
            )}
          </div>
        </div>
      ) : null}
    </header>
  )
}
