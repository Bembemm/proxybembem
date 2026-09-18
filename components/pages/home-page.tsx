"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { StorefrontProductCard } from "@/components/storefront-product-card"
import type { StorefrontProduct } from "@/contexts/cart-context"

function getItemsPerPage() {
  if (typeof window === "undefined") return 1
  return window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 2 : 1
}

export function HomePage({
  products,
  unavailable = false,
}: {
  products: StorefrontProduct[]
  unavailable?: boolean
  productionLeadTimeBusinessDays: number
}) {
  const carouselRef = useRef<HTMLDivElement | null>(null)
  const [itemsPerPage, setItemsPerPage] = useState(1)
  const [activePage, setActivePage] = useState(0)

  const pageCount = Math.ceil(products.length / itemsPerPage)
  const pages = Array.from({ length: pageCount }, (_, pageIndex) =>
    products.slice(pageIndex * itemsPerPage, (pageIndex + 1) * itemsPerPage),
  )

  const getCarouselPages = useCallback(() => {
    const carousel = carouselRef.current
    if (!carousel) return []

    return Array.from(carousel.querySelectorAll<HTMLElement>("[data-carousel-page]"))
  }, [])

  const updateScrollState = useCallback(() => {
    const carousel = carouselRef.current
    if (!carousel) return

    const pageElements = getCarouselPages()
    if (pageElements.length === 0) {
      setActivePage(0)
      return
    }

    const firstPageOffset = pageElements[0].offsetLeft
    let nearestPage = 0
    let nearestDistance = Number.POSITIVE_INFINITY

    pageElements.forEach((page, pageIndex) => {
      const pageOffset = page.offsetLeft - firstPageOffset
      const distance = Math.abs(pageOffset - carousel.scrollLeft)

      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestPage = pageIndex
      }
    })

    setActivePage(nearestPage)
  }, [getCarouselPages])

  useEffect(() => {
    const updateItemsPerPage = () => {
      setItemsPerPage(getItemsPerPage())
    }

    updateItemsPerPage()
    window.addEventListener("resize", updateItemsPerPage)

    return () => {
      window.removeEventListener("resize", updateItemsPerPage)
    }
  }, [])

  useEffect(() => {
    const carousel = carouselRef.current
    if (!carousel) return

    setActivePage(0)
    carousel.scrollTo({ left: 0, behavior: "auto" })
    updateScrollState()

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScrollState)
    resizeObserver?.observe(carousel)

    return () => {
      resizeObserver?.disconnect()
    }
  }, [itemsPerPage, updateScrollState])

  const scrollToPage = (page: number) => {
    const carousel = carouselRef.current
    const pageElements = getCarouselPages()
    if (!carousel || pageElements.length === 0) return

    const lastPage = pageElements.length - 1
    const nextPage = Math.min(lastPage, Math.max(0, page))
    const firstPageOffset = pageElements[0].offsetLeft
    const targetOffset = Math.max(
      0,
      pageElements[nextPage].offsetLeft - firstPageOffset,
    )

    carousel.scrollTo({
      left: targetOffset,
      behavior: "smooth",
    })
  }

  const scrollFeatured = (direction: -1 | 1) => {
    scrollToPage(activePage + direction)
  }

  const canScrollLeft = activePage > 0
  const canScrollRight = activePage < pageCount - 1

  return (
    <>
      <section className="bg-white pb-10 pt-6 lg:pb-12 lg:pt-8">
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <div className="mb-5 flex items-end justify-between gap-4 lg:mb-6">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 lg:text-[32px]">
              Destaques
            </h1>
            <Link
              href="/produtos"
              className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[#7C3AED] transition-colors hover:text-[#6D28D9] sm:text-base"
            >
              Ver todos <span aria-hidden="true">→</span>
            </Link>
          </div>

          {unavailable ? (
            <div className="border border-slate-200 bg-slate-50 px-5 py-8 text-center" role="status">
              <p className="text-base font-medium text-slate-700">Catálogo temporariamente indisponível.</p>
              <p className="mt-1 text-sm text-slate-500">Tente novamente em alguns instantes.</p>
            </div>
          ) : null}

          {!unavailable && products.length === 0 ? (
            <div className="border border-slate-200 bg-slate-50 px-5 py-8 text-center">
              <p className="text-base text-slate-600">Nenhum produto disponível no momento.</p>
            </div>
          ) : null}

          {!unavailable && products.length > 0 ? (
            <div className="relative">
              {pageCount > 1 ? (
                <button
                  type="button"
                  onClick={() => scrollFeatured(-1)}
                  disabled={!canScrollLeft}
                  aria-label="Ver página anterior de produtos"
                  className="absolute -left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-violet-100 bg-white/95 text-slate-900 shadow-md transition hover:bg-violet-50 disabled:pointer-events-none disabled:opacity-0 sm:-left-3 sm:h-11 sm:w-11"
                >
                  <ArrowLeft className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                </button>
              ) : null}

              <div
                ref={carouselRef}
                onScroll={updateScrollState}
                aria-label="Produtos em destaque"
                className="-mx-4 snap-x snap-mandatory overflow-x-auto scroll-smooth px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
              >
                <div className="flex">
                  {pages.map((page, pageIndex) => (
                    <div
                      key={page[0]?.id ?? pageIndex}
                      data-carousel-page
                      aria-label={`Página ${pageIndex + 1} de ${pageCount}`}
                      className="w-full shrink-0 snap-start"
                    >
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {page.map((product) => (
                          <StorefrontProductCard
                            key={product.id}
                            product={product}
                            className="h-full w-full"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {pageCount > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => scrollFeatured(1)}
                    disabled={!canScrollRight}
                    aria-label="Ver próxima página de produtos"
                    className="absolute -right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-violet-100 bg-white/95 text-slate-900 shadow-md transition hover:bg-violet-50 disabled:pointer-events-none disabled:opacity-0 sm:-right-3 sm:h-11 sm:w-11"
                  >
                    <ArrowRight className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                  </button>

                  <div className="mt-4 flex items-center justify-center gap-2" aria-label="Páginas dos produtos em destaque">
                    {pages.map((page, pageIndex) => (
                      <button
                        key={page[0]?.id ?? pageIndex}
                        type="button"
                        onClick={() => scrollToPage(pageIndex)}
                        aria-label={`Ir para página ${pageIndex + 1}`}
                        aria-current={activePage === pageIndex ? "true" : undefined}
                        className={`rounded-full transition-all ${
                          activePage === pageIndex
                            ? "h-2.5 w-2.5 bg-[#8B5CF6]"
                            : "h-2 w-2 bg-slate-200 hover:bg-slate-300"
                        }`}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </>
  )
}
