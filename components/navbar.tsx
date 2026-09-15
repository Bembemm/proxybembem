"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, ShoppingCart, UserRound } from "lucide-react"
import { useCart } from "@/contexts/cart-context"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

type AccountState = "loading" | "guest" | "authenticated"
type CatalogCategoryProduct = { category: string }

function isCatalogCategoryProduct(value: unknown): value is CatalogCategoryProduct {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { category?: unknown }).category === "string"
  )
}

export function Navbar() {
  const [accountState, setAccountState] = useState<AccountState>("loading")
  const [categories, setCategories] = useState<string[]>([])
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false)
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

  useEffect(() => {
    let cancelled = false

    void fetch("/api/catalog", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null
        return (await response.json()) as unknown
      })
      .then((payload) => {
        if (cancelled || typeof payload !== "object" || payload === null) return

        const rawProducts = (payload as { products?: unknown }).products
        if (!Array.isArray(rawProducts)) return

        const products = rawProducts.filter(isCatalogCategoryProduct)
        const nextCategories = Array.from(
          new Set(
            products
              .map((product) => product.category.trim())
              .filter((category) => category.length > 0 && category.length <= 100),
          ),
        ).sort((left, right) => left.localeCompare(right, "pt-BR"))

        setCategories(nextCategories)
      })
      .catch(() => {
        if (!cancelled) setCategories([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setIsCategoriesOpen(false)
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
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-slate-200/70 bg-white/95 shadow-sm backdrop-blur-xl">
      <nav
        className="container mx-auto flex h-14 items-center justify-between gap-2 px-3 sm:h-16 sm:px-4"
        aria-label="Navegação principal"
      >
        <a href="/" className="flex min-w-0 items-center gap-2">
          <img src="/brand/pb" alt="" aria-hidden="true" className="h-10 w-auto shrink-0 object-contain sm:h-12" />
          <span className="hidden truncate text-xl tracking-wide text-black sm:inline sm:text-2xl font-[family-name:var(--font-display)]">
            ProxyBembem
          </span>
        </a>

        <div className="flex items-center gap-1 sm:gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsCategoriesOpen((current) => !current)}
              className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors sm:px-4 sm:text-base ${
                pathname.startsWith("/produtos") || isCategoriesOpen
                  ? "bg-[#8B5CF6]/10 text-[#7C3AED]"
                  : "text-slate-700 hover:bg-slate-100 hover:text-[#7C3AED]"
              }`}
              aria-expanded={isCategoriesOpen}
              aria-controls="store-category-menu"
              aria-haspopup="menu"
            >
              Categorias
              <ChevronDown
                className={`h-4 w-4 transition-transform ${isCategoriesOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {isCategoriesOpen ? (
              <div
                id="store-category-menu"
                role="menu"
                className="absolute right-0 top-[calc(100%+0.5rem)] w-64 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl sm:left-0 sm:right-auto"
              >
                {categories.length > 0 ? (
                  categories.map((category) => (
                    <a
                      key={category}
                      href={`/produtos?categoria=${encodeURIComponent(category)}`}
                      role="menuitem"
                      onClick={() => setIsCategoriesOpen(false)}
                      className="block rounded-lg px-3 py-2.5 text-sm text-slate-700 transition-colors hover:bg-[#8B5CF6]/10 hover:text-[#7C3AED]"
                    >
                      {category}
                    </a>
                  ))
                ) : (
                  <span className="block px-3 py-2.5 text-sm text-slate-500">
                    Categorias indisponíveis no momento.
                  </span>
                )}
              </div>
            ) : null}
          </div>

          <div className="ml-1 flex items-center gap-1 border-l border-slate-200 pl-2 sm:pl-3">
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
      </nav>
    </header>
  )
}
