"use client"

import {
  Children,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { ArrowLeft, ArrowRight } from "lucide-react"

function getItemsPerPage() {
  if (typeof window === "undefined") return 1
  return window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 2 : 1
}

export function HomeHighlightsCarousel({ children }: { children: ReactNode }) {
  const carouselRef = useRef<HTMLDivElement | null>(null)
  const [itemsPerPage, setItemsPerPage] = useState(1)
  const [activePage, setActivePage] = useState(0)
  const items = useMemo(() => Children.toArray(children), [children])
  const pageCount = Math.ceil(items.length / itemsPerPage)
  const pages = Array.from({ length: pageCount }, (_, pageIndex) =>
    items.slice(pageIndex * itemsPerPage, (pageIndex + 1) * itemsPerPage),
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
      const distance = Math.abs(page.offsetLeft - firstPageOffset - carousel.scrollLeft)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestPage = pageIndex
      }
    })

    setActivePage(nearestPage)
  }, [getCarouselPages])

  useEffect(() => {
    const updateItemsPerPage = () => setItemsPerPage(getItemsPerPage())
    updateItemsPerPage()
    window.addEventListener("resize", updateItemsPerPage)
    return () => window.removeEventListener("resize", updateItemsPerPage)
  }, [])

  useEffect(() => {
    const carousel = carouselRef.current
    if (!carousel) return

    carousel.scrollTo({ left: 0, behavior: "auto" })

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScrollState)
    observer?.observe(carousel)

    return () => observer?.disconnect()
  }, [itemsPerPage, updateScrollState])

  const scrollToPage = (page: number) => {
    const carousel = carouselRef.current
    const pageElements = getCarouselPages()
    if (!carousel || pageElements.length === 0) return

    const nextPage = Math.min(pageElements.length - 1, Math.max(0, page))
    const firstPageOffset = pageElements[0].offsetLeft

    carousel.scrollTo({
      left: Math.max(0, pageElements[nextPage].offsetLeft - firstPageOffset),
      behavior: "smooth",
    })
  }

  const goToPage = (page: number) => {
    const nextPage = Math.min(pageCount - 1, Math.max(0, page))

    if (itemsPerPage === 1) {
      setActivePage(nextPage)
      return
    }

    scrollToPage(nextPage)
  }

  const safeActivePage = Math.min(activePage, Math.max(0, pageCount - 1))
  const canScrollLeft = safeActivePage > 0
  const canScrollRight = safeActivePage < pageCount - 1
  const activeMobileItem = pages[safeActivePage]?.[0] ?? pages[0]?.[0] ?? null

  return (
    <div className="relative">
      {pageCount > 1 && itemsPerPage > 1 ? (
        <button
          type="button"
          onClick={() => goToPage(safeActivePage - 1)}
          disabled={!canScrollLeft}
          aria-label="Ver página anterior de produtos"
          className="absolute -left-3 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-violet-100 bg-white/95 text-slate-900 shadow-md transition hover:bg-violet-50 disabled:pointer-events-none disabled:opacity-0 sm:flex"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : null}

      {itemsPerPage === 1 ? (
        <div aria-label="Produto em destaque" className="w-full overflow-hidden">
          <div data-carousel-page className="w-full">
            {activeMobileItem}
          </div>
        </div>
      ) : (
        <div
          ref={carouselRef}
          onScroll={updateScrollState}
          aria-label="Produtos em destaque"
          className="-mx-6 snap-x snap-mandatory overflow-x-auto scroll-smooth px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:px-0"
        >
          <div className="flex">
            {pages.map((page, pageIndex) => (
              <div
                key={pageIndex}
                data-carousel-page
                aria-label={`Página ${pageIndex + 1} de ${pageCount}`}
                className="w-full shrink-0 snap-start"
              >
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {page}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pageCount > 1 && itemsPerPage > 1 ? (
        <button
          type="button"
          onClick={() => goToPage(safeActivePage + 1)}
          disabled={!canScrollRight}
          aria-label="Ver próxima página de produtos"
          className="absolute -right-3 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-violet-100 bg-white/95 text-slate-900 shadow-md transition hover:bg-violet-50 disabled:pointer-events-none disabled:opacity-0 sm:flex"
        >
          <ArrowRight className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : null}

      {pageCount > 1 ? (
        <div
          className="mt-4 flex items-center justify-center gap-2 sm:mt-4"
          aria-label="Páginas dos produtos em destaque"
        >
          {pages.map((_, pageIndex) => (
            <button
              key={pageIndex}
              type="button"
              onClick={() => goToPage(pageIndex)}
              aria-label={`Ir para página ${pageIndex + 1}`}
              aria-current={safeActivePage === pageIndex ? "true" : undefined}
              className={
                "h-2 w-2 rounded-full transition-all sm:h-2 sm:w-2 " +
                (safeActivePage === pageIndex
                  ? "bg-[#7C3AED]"
                  : "bg-slate-200 hover:bg-slate-300")
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
