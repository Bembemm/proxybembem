"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, Menu, Search, ShoppingCart, UserRound, X } from "lucide-react"
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
  const pathname = usePathname()
  const { totalItems, setIsCartOpen } = useCart()

  useEffect(() => {
    let cancelled = false
    const supabase = createSupabaseBrowserClient()

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

  const accountItem =
    accountState === "loading"
      ? null
      : accountState === "authenticated"
        ? { label: "Meu perfil", href: "/minha-conta/perfil" }
        : { label: "Entrar", href: "/entrar" }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)

  const cartButton = (
    <button
      type="button"
      onClick={() => setIsCartOpen(true)}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-800 transition-colors hover:bg-slate-100 hover:text-[#8B5CF6]"
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

  const accountButton = accountItem ? (
    <Link
      href={accountItem.href}
      onClick={() => {
        setIsCategoriesOpen(false)
        setIsMobileMenuOpen(false)
        setIsMobileSearchOpen(false)
      }}
      aria-current={isActive(accountItem.href) ? "page" : undefined}
      aria-label={accountItem.label}
      title={accountItem.label}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
        isActive(accountItem.href)
          ? "bg-[#8B5CF6]/10 text-[#8B5CF6]"
          : "text-slate-800 hover:bg-slate-100 hover:text-[#8B5CF6]"
      }`}
    >
      <UserRound className="h-5 w-5" />
    </Link>
  ) : (
    <span className="h-10 w-10" aria-hidden="true" />
  )

  const categoryItems =
    categories.length > 0 ? (
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
    )

  return (
    <header className="sticky top-0 z-50 bg-white/95 shadow-sm backdrop-blur-xl">
      <div className="border-b border-slate-200/80">
        <nav
          className="mx-auto grid h-16 w-full max-w-[1180px] grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6 lg:h-[72px] lg:grid-cols-[auto_minmax(280px,1fr)_auto] lg:gap-8 lg:px-8"
          aria-label="Navegação principal"
        >
          <button
            type="button"
            onClick={() => {
              setIsMobileMenuOpen((current) => !current)
              setIsMobileSearchOpen(false)
            }}
            className="col-start-1 row-start-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-900 transition-colors hover:bg-slate-100 lg:hidden"
            aria-label="Abrir menu"
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-store-menu"
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>

          <a
            href="/"
            className="col-start-2 row-start-1 flex min-w-0 items-center justify-self-center gap-2.5 lg:col-start-1 lg:justify-self-start"
            aria-label="ProxyBembem - Início"
          >
            <img
              src="/brand/pb"
              alt=""
              aria-hidden="true"
              className="h-10 w-auto shrink-0 object-contain lg:h-11"
            />
            <span className="hidden truncate text-2xl tracking-wide text-black lg:inline font-[family-name:var(--font-display)]">
              ProxyBembem
            </span>
          </a>

          <form
            id="desktop-store-search"
            action="/produtos"
            method="get"
            role="search"
            className="hidden min-w-0 max-w-[460px] items-center justify-self-center rounded-full border border-slate-200 bg-slate-50/80 px-4 shadow-sm transition focus-within:border-[#8B5CF6]/60 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8B5CF6]/10 lg:flex lg:w-full"
          >
            <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              name="busca"
              maxLength={100}
              placeholder="Buscar produtos..."
              aria-label="Buscar produtos"
              className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
            <button
              type="submit"
              aria-label="Buscar produtos"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-[#8B5CF6]/10 hover:text-[#7C3AED]"
            >
              <Search className="h-4 w-4" />
            </button>
          </form>

          <div className="col-start-3 row-start-1 flex items-center justify-self-end gap-0.5 lg:gap-2">
            <button
              type="button"
              onClick={() => {
                setIsMobileSearchOpen((current) => !current)
                setIsMobileMenuOpen(false)
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-800 transition-colors hover:bg-slate-100 hover:text-[#8B5CF6] lg:hidden"
              aria-label="Buscar produtos"
              aria-expanded={isMobileSearchOpen}
              aria-controls="mobile-store-search"
            >
              <Search className="h-5 w-5" />
            </button>

            <a
              href="/contato"
              className={`hidden h-10 items-center px-3 text-sm font-medium transition-colors lg:inline-flex ${
                isActive("/contato") ? "text-[#7C3AED]" : "text-slate-700 hover:text-[#7C3AED]"
              }`}
            >
              Contato
            </a>
            <div className="hidden h-5 w-px bg-slate-200 lg:block" aria-hidden="true" />
            <div className="hidden lg:block">{accountButton}</div>
            {cartButton}
          </div>
        </nav>
      </div>

      {isMobileSearchOpen ? (
        <div className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm lg:hidden">
          <form
            id="mobile-store-search"
            action="/produtos"
            method="get"
            role="search"
            className="mx-auto flex max-w-lg items-center rounded-full border border-slate-200 bg-slate-50 px-4 focus-within:border-[#8B5CF6]/60 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8B5CF6]/10"
          >
            <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              name="busca"
              maxLength={100}
              autoFocus
              placeholder="Buscar produtos..."
              aria-label="Buscar produtos"
              className="h-11 min-w-0 flex-1 bg-transparent px-3 text-base text-slate-900 outline-none placeholder:text-slate-400"
            />
            <button
              type="submit"
              aria-label="Buscar produtos"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-[#8B5CF6]/10 hover:text-[#7C3AED]"
            >
              <Search className="h-4 w-4" />
            </button>
          </form>
        </div>
      ) : null}

      <div className="hidden border-b border-slate-200/80 bg-white lg:block">
        <nav
          className="mx-auto flex h-11 w-full max-w-[1180px] items-center gap-8 px-8 text-sm"
          aria-label="Navegação da loja"
        >
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsCategoriesOpen((current) => !current)}
              className={`inline-flex h-9 items-center gap-1.5 font-medium transition-colors ${
                pathname.startsWith("/produtos") || isCategoriesOpen
                  ? "text-[#7C3AED]"
                  : "text-slate-700 hover:text-[#7C3AED]"
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
                className="absolute left-0 top-[calc(100%+0.35rem)] w-64 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
              >
                {categoryItems}
              </div>
            ) : null}
          </div>

          <a
            href="/"
            aria-current={isActive("/") ? "page" : undefined}
            className={`font-medium transition-colors ${
              isActive("/") ? "text-[#7C3AED]" : "text-slate-700 hover:text-[#7C3AED]"
            }`}
          >
            Início
          </a>
          <a
            href="/produtos"
            aria-current={isActive("/produtos") ? "page" : undefined}
            className={`font-medium transition-colors ${
              isActive("/produtos") ? "text-[#7C3AED]" : "text-slate-700 hover:text-[#7C3AED]"
            }`}
          >
            Produtos
          </a>
        </nav>
      </div>

      {isMobileMenuOpen ? (
        <div
          id="mobile-store-menu"
          className="border-b border-slate-200 bg-white px-4 py-2 shadow-lg lg:hidden"
        >
          <nav className="mx-auto flex max-w-lg flex-col" aria-label="Menu móvel da loja">
            <a
              href="/"
              className="flex min-h-12 items-center border-b border-slate-100 px-1 text-base font-medium text-slate-900"
            >
              Início
            </a>
            <a
              href="/produtos"
              className="flex min-h-12 items-center border-b border-slate-100 px-1 text-base font-medium text-slate-900"
            >
              Produtos
            </a>
            <a
              href="/contato"
              className="flex min-h-12 items-center px-1 text-base font-medium text-slate-900"
            >
              Contato
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  )
}
