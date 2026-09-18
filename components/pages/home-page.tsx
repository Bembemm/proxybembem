"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { StorefrontProductCard } from "@/components/storefront-product-card"
import type { Product } from "@/contexts/cart-context"

export function HomePage({
  products,
  unavailable = false,
}: {
  products: Product[]
  unavailable?: boolean
  productionLeadTimeBusinessDays: number
}) {
  const carouselRef = useRef<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(products.length > 1)
  const [activePage, setActivePage] = useState(0)

  const getCarouselItems = useCallback(() => {
    const carousel = carouselRef.current
    if (!carousel) return []

    return Array.from(carousel.querySelectorAll<HTMLElement>("[data-carousel-item]"))
  }, [])

  const updateScrollState = useCallback(() => {
    const carousel = carouselRef.current
    if (!carousel) return

    const items = getCarouselItems()
    if (items.length === 0) {
      setActivePage(0)
      setCanScrollLeft(false)
      setCanScrollRight(false)
      return
    }

    const firstItemOffset = items[0].offsetLeft
    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY

    items.forEach((item, index) => {
      const itemOffset = item.offsetLeft - firstItemOffset
      const distance = Math.abs(itemOffset - carousel.scrollLeft)

      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    })

    const maxScrollLeft = Math.max(carousel.scrollWidth - carousel.clientWidth, 0)
    setActivePage(nearestIndex)
    setCanScrollLeft(carousel.scrollLeft > 2)
    setCanScrollRight(carousel.scrollLeft < maxScrollLeft - 2)
  }, [getCarouselItems])

  useEffect(() => {
    const carousel = carouselRef.current
    if (!carousel) return

    updateScrollState()

    const handleResize = () => updateScrollState()
    window.addEventListener("resize", handleResize)

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleResize)
    resizeObserver?.observe(carousel)

    return () => {
      window.removeEventListener("resize", handleResize)
      resizeObserver?.disconnect()
    }
  }, [updateScrollState])

  const scrollToPage = (page: number) => {
    const carousel = carouselRef.current
    const items = getCarouselItems()
    if (!carousel || items.length === 0) return

    const lastPage = items.length - 1
    const nextPage = Math.min(lastPage, Math.max(0, page))
    const firstItemOffset = items[0].offsetLeft
    const targetOffset = Math.max(0, items[nextPage].offsetLeft - firstItemOffset)

    carousel.scrollTo({
      left: targetOffset,
      behavior: "smooth",
    })
  }

  const scrollFeatured = (direction: -1 | 1) => {
    scrollToPage(activePage + direction)
  }

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
              {products.length > 1 ? (
                <button
                  type="button"
                  onClick={() => scrollFeatured(-1)}
                  disabled={!canScrollLeft}
                  aria-label="Ver produto anterior"
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
                <div className="flex gap-4">
                  {products.map((product, index) => (
                    <div
                      key={product.id}
                      data-carousel-item
                      aria-label={`Destaque ${index + 1} de ${products.length}`}
                      className="w-[82vw] shrink-0 snap-start sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)] xl:w-[calc((100%-3rem)/4)]"
                    >
                      <StorefrontProductCard product={product} className="h-full w-full" />
                    </div>
                  ))}
                </div>
              </div>

              {products.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => scrollFeatured(1)}
                    disabled={!canScrollRight}
                    aria-label="Ver próximo produto"
                    className="absolute -right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-violet-100 bg-white/95 text-slate-900 shadow-md transition hover:bg-violet-50 disabled:pointer-events-none disabled:opacity-0 sm:-right-3 sm:h-11 sm:w-11"
                  >
                    <ArrowRight className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                  </button>

                  <div className="mt-4 flex items-center justify-center gap-2" aria-label="Produtos em destaque">
                    {products.map((product, index) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => scrollToPage(index)}
                        aria-label={`Ir para produto ${index + 1}`}
                        aria-current={activePage === index ? "true" : undefined}
                        className={`rounded-full transition-all ${
                          activePage === index
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
