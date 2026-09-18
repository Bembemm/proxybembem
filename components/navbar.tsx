"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, Menu, Search, ShoppingCart, UserRound, X } from "lucide-react"
import { useCart } from "@/contexts/cart-context"
import { productHref } from "@/lib/products/product-url"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

type AccountState = "loading" | "guest" | "authenticated"

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
}

function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

export function Navbar() {
  const [accountState, setAccountState] = useState<AccountState>("loading")
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const pathname = usePathname()
  const { totalItems, setIsCartOpen, catalogProducts, catalogStatus, ensureCatalog } = useCart()

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setAccountState(session?.user ? "authenticated" : "guest")
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          catalogProducts
            .map((product) => product.category.trim())
            .filter((category) => category.length > 0 && category.length <= 100),
        ),
      ).sort((left, right) => left.localeCompare(right, "pt-BR")),
    [catalogProducts],
  )

  const accountItem =
    accountState === "loading"
      ? null
      : accountState === "authenticated"
        ? { label: "Meu perfil", href: "/minha-conta/perfil" }
        : { label: "Entrar", href: "/entrar" }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/")

  const closeOverlays = () => {
    setIsCategoriesOpen(false)
    setIsMobileMenuOpen(false)
    setIsSearchOpen(false)
  }

  const normalizedQuery = normalizeSearch(searchQuery)
  const searchSuggestions =
    normalizedQuery.length === 0
      ? []
      : catalogProducts
          .filter((product) => normalizeSearch(product.title).includes(normalizedQuery))
          .slice(0, 5)

  const cartButton = (
    <button
      type="button"
      onClick={() => {
        void ensureCatalog()
        setIsCartOpen(true)
      }}
      className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-800 transition-colors hover:bg-violet-50 hover:text-[#7C3AED]"
      aria-label="Abrir carrinho"
    >
      <ShoppingCart className="h-5 w-5" aria-hidden="true" />
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
      onClick={closeOverlays}
      aria-current={isActive(accountItem.href) ? "page" : undefined}
      aria-label={accountItem.label}
      title={accountItem.label}
      className={
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors " +
        (isActive(accountItem.href)
          ? "bg-violet-50 text-[#7C3AED]"
          : "text-slate-800 hover:bg-violet-50 hover:text-[#7C3AED]")
      }
    >
      <UserRound className="h-5 w-5" aria-hidden="true" />
    </Link>
  ) : (
    <span className="h-10 w-10 shrink-0" aria-hidden="true" />
  )

  const categoryItems =
    categories.length > 0 ? (
      categories.map((category) => (
        <a
          key={category}
          href={`/produtos?categoria=${encodeURIComponent(category)}`}
          role="menuitem"
          onClick={closeOverlays}
          className="block rounded-lg px-3 py-2.5 text-sm text-slate-700 transition-colors hover:bg-violet-50 hover:text-[#7C3AED]"
        >
          {category}
        </a>
      ))
    ) : (
      <span className="block px-3 py-2.5 text-sm text-slate-500">
        {catalogStatus === "loading" ? "Carregando categorias..." : "Categorias indisponíveis no momento."}
      </span>
    )

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 shadow-sm">
      <nav
        className="mx-auto grid h-16 w-full max-w-[1180px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:px-5 lg:h-[72px] lg:gap-7 lg:px-8"
        aria-label="Navegação principal"
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setIsMobileMenuOpen((current) => !current)
              setIsSearchOpen(false)
              setIsCategoriesOpen(false)
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-900 transition hover:bg-slate-100 lg:hidden"
            aria-label={isMobileMenuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-store-menu"
          >
            {isMobileMenuOpen ? <X className="h-5.5 w-5.5" /> : <Menu className="h-5.5 w-5.5" />}
          </button>

          <a
            href="/"
            onClick={closeOverlays}
            className="flex min-w-0 items-center gap-2.5"
            aria-label="ProxyBembem - Início"
          >
            <Image
              src="/brand/pb"
              alt=""
              aria-hidden="true"
              width={48}
              height={48}
              className="h-9 w-auto shrink-0 object-contain sm:h-10 lg:h-11"
            />
            <span className="hidden truncate text-2xl tracking-wide text-black lg:inline font-[family-name:var(--font-display)]">
              ProxyBembem
            </span>
          </a>
        </div>

        <div className="hidden min-w-0 items-center justify-center gap-7 lg:flex">
          <Link
            href="/"
            aria-current={isActive("/") ? "page" : undefined}
            className={
              "text-sm font-medium transition-colors " +
              (isActive("/") ? "text-[#7C3AED]" : "text-slate-700 hover:text-[#7C3AED]")
            }
          >
            Início
          </Link>

          <a
            href="/produtos"
            aria-current={isActive("/produtos") ? "page" : undefined}
            className={
              "text-sm font-medium transition-colors " +
              (isActive("/produtos") ? "text-[#7C3AED]" : "text-slate-700 hover:text-[#7C3AED]")
            }
          >
            Produtos
          </a>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                const nextOpen = !isCategoriesOpen
                setIsCategoriesOpen(nextOpen)
                setIsSearchOpen(false)
                if (nextOpen) void ensureCatalog()
              }}
              className={
                "inline-flex h-10 items-center gap-1 text-sm font-medium transition-colors " +
                (isCategoriesOpen ? "text-[#7C3AED]" : "text-slate-700 hover:text-[#7C3AED]")
              }
              aria-expanded={isCategoriesOpen}
              aria-controls="store-category-menu"
              aria-haspopup="menu"
            >
              Categorias
              <ChevronDown
                className={"h-4 w-4 transition-transform " + (isCategoriesOpen ? "rotate-180" : "")}
                aria-hidden="true"
              />
            </button>

            {isCategoriesOpen ? (
              <div
                id="store-category-menu"
                role="menu"
                className="absolute left-1/2 top-[calc(100%+0.6rem)] w-64 -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
              >
                {categoryItems}
              </div>
            ) : null}
          </div>

          <Link
            href="/contato"
            aria-current={isActive("/contato") ? "page" : undefined}
            className={
              "text-sm font-medium transition-colors " +
              (isActive("/contato") ? "text-[#7C3AED]" : "text-slate-700 hover:text-[#7C3AED]")
            }
          >
            Contato
          </Link>
        </div>

        <div className="flex items-center justify-self-end gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={() => {
              const nextOpen = !isSearchOpen
              setIsSearchOpen(nextOpen)
              setIsMobileMenuOpen(false)
              setIsCategoriesOpen(false)
              if (nextOpen) void ensureCatalog()
            }}
            className={
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors " +
              (isSearchOpen
                ? "bg-violet-50 text-[#7C3AED]"
                : "text-slate-800 hover:bg-violet-50 hover:text-[#7C3AED]")
            }
            aria-label="Buscar produtos"
            aria-expanded={isSearchOpen}
            aria-controls="store-search-panel"
          >
            {isSearchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </button>
          {accountButton}
          {cartButton}
        </div>
      </nav>

      {isSearchOpen ? (
        <div id="store-search-panel" className="border-t border-slate-100 bg-white px-3 py-3 shadow-lg sm:px-5">
          <div className="mx-auto w-full max-w-2xl">
            <form
              id="store-search"
              action="/produtos"
              method="get"
              role="search"
              className="flex items-center rounded-xl border border-violet-200 bg-slate-50 px-3 shadow-sm focus-within:border-[#8B5CF6] focus-within:bg-white focus-within:ring-2 focus-within:ring-violet-100"
            >
              <Search className="h-4 w-4 shrink-0 text-[#8B5CF6]" aria-hidden="true" />
              <input
                type="search"
                name="busca"
                maxLength={100}
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar produtos..."
                aria-label="Buscar produtos"
                className="h-11 min-w-0 flex-1 bg-transparent px-3 text-base text-slate-900 outline-none placeholder:text-slate-400 sm:text-sm"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </form>

            {normalizedQuery.length > 0 ? (
              <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-950">Produtos sugeridos</p>
                  <span className="text-xs text-slate-400">
                    {searchSuggestions.length} resultado{searchSuggestions.length === 1 ? "" : "s"}
                  </span>
                </div>

                {searchSuggestions.length > 0 ? (
                  <div>
                    {searchSuggestions.map((product) => (
                      <Link
                        key={product.id}
                        href={productHref(product)}
                        onClick={closeOverlays}
                        className="flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 transition last:border-0 hover:bg-violet-50/60 sm:px-4"
                      >
                        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                          <Image
                            src={product.image}
                            alt=""
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">
                            {product.title}
                          </span>
                          <span className="mt-0.5 block text-sm font-bold text-[#7C3AED]">
                            {formatPrice(product.discountPrice)}
                          </span>
                        </span>
                        <ChevronDown className="-rotate-90 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-5 text-center text-sm text-slate-500">
                    {catalogStatus === "loading"
                      ? "Carregando produtos..."
                      : "Nenhum produto encontrado com esse nome."}
                  </p>
                )}

                <Link
                  href={"/produtos?busca=" + encodeURIComponent(searchQuery.trim())}
                  onClick={closeOverlays}
                  className="flex min-h-11 items-center justify-between gap-3 border-t border-slate-100 bg-violet-50/50 px-4 text-sm font-semibold text-[#7C3AED] transition hover:bg-violet-50"
                >
                  <span>Ver todos os resultados</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isMobileMenuOpen ? (
        <div
          id="mobile-store-menu"
          className="border-t border-slate-100 bg-white px-4 py-2 shadow-lg lg:hidden"
        >
          <nav className="mx-auto flex max-w-lg flex-col" aria-label="Menu móvel da loja">
            <Link
              href="/"
              onClick={closeOverlays}
              className="flex min-h-12 items-center border-b border-slate-100 px-1 text-base font-medium text-slate-900"
            >
              Início
            </Link>
            <a
              href="/produtos"
              onClick={closeOverlays}
              className="flex min-h-12 items-center border-b border-slate-100 px-1 text-base font-medium text-slate-900"
            >
              Produtos
            </a>
            <Link
              href="/contato"
              onClick={closeOverlays}
              className="flex min-h-12 items-center px-1 text-base font-medium text-slate-900"
            >
              Contato
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  )
}
